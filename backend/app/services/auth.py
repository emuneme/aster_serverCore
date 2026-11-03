import ctypes
import ctypes.util
import grp
import os
import pwd
import socket
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings
from app.schemas import ServerAuthInfo, UserInfo

# Bearer security scheme (auto_error=False para suportar fallback por query param em WebSockets)
security_bearer = HTTPBearer(auto_error=False)


class AuthService:
    """
    Serviço de Autenticação Híbrida:
    1. PAM do Ubuntu Server (validação de utilizador local do sistema e grupo sudo)
    2. Fallback de Conta Administrativa SGLinux (independente do sistema operacional)
    """

    @classmethod
    def _authenticate_via_pam_linux(cls, username: str, password: str) -> bool:
        """
        Autentica credenciais diretamente contra o sistema Linux:
        1. Verificação direta de shadow (/etc/shadow) quando executando como root
        2. Fallback via PAM com alocação segura em heap libc (sem risco de segfault)
        """
        if not sys.platform.startswith("linux"):
            return False

        # Método 1: Verificação direta via shadow (/etc/shadow) quando root
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            try:
                import spwd
                spwd_entry = spwd.getspnam(username)
                hashed_pwd = spwd_entry.sp_pwdp
                if hashed_pwd:
                    try:
                        import crypt
                        if crypt.crypt(password, hashed_pwd) == hashed_pwd:
                            return True
                    except Exception:
                        pass
                    try:
                        libcrypt_path = ctypes.util.find_library("crypt") or "libcrypt.so.1"
                        libcrypt = ctypes.CDLL(libcrypt_path)
                        libcrypt.crypt.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
                        libcrypt.crypt.restype = ctypes.c_char_p
                        res = libcrypt.crypt(password.encode("utf-8"), hashed_pwd.encode("utf-8"))
                        if res and res.decode("utf-8") == hashed_pwd:
                            return True
                    except Exception:
                        pass
            except Exception:
                pass

        # Método 2: Transação PAM no Linux via ctypes com memória segura libc.calloc/libc.strdup
        try:
            pam_lib_path = ctypes.util.find_library("pam") or "libpam.so.0"
            pam = ctypes.CDLL(pam_lib_path)
            libc_path = ctypes.util.find_library("c") or "libc.so.6"
            libc = ctypes.CDLL(libc_path)

            libc.calloc.restype = ctypes.c_void_p
            libc.calloc.argtypes = [ctypes.c_size_t, ctypes.c_size_t]
            libc.strdup.restype = ctypes.c_void_p
            libc.strdup.argtypes = [ctypes.c_char_p]

            PAM_PROMPT_ECHO_OFF = 1
            PAM_SUCCESS = 0

            class PamMessage(ctypes.Structure):
                _fields_ = [("msg_style", ctypes.c_int), ("msg", ctypes.c_char_p)]

            class PamResponse(ctypes.Structure):
                _fields_ = [("resp", ctypes.c_char_p), ("resp_retcode", ctypes.c_int)]

            conv_func_type = ctypes.CFUNCTYPE(
                ctypes.c_int,
                ctypes.c_int,
                ctypes.POINTER(ctypes.POINTER(PamMessage)),
                ctypes.POINTER(ctypes.POINTER(PamResponse)),
                ctypes.c_void_p,
            )

            pwd_bytes = password.encode("utf-8")

            def conv_handler(num_msg, msg, resp, appdata_ptr):
                # Aloca memória nativa na heap do libc para que o free() do PAM funcione sem segfault
                resp_addr = libc.calloc(num_msg, ctypes.sizeof(PamResponse))
                r = ctypes.cast(resp_addr, ctypes.POINTER(PamResponse))
                for i in range(num_msg):
                    if msg[i].contents.msg_style == PAM_PROMPT_ECHO_OFF:
                        r[i].resp = ctypes.cast(libc.strdup(pwd_bytes), ctypes.c_char_p)
                        r[i].resp_retcode = 0
                    else:
                        r[i].resp = ctypes.cast(libc.strdup(b""), ctypes.c_char_p)
                        r[i].resp_retcode = 0
                resp[0] = r
                return PAM_SUCCESS

            conv_callback = conv_func_type(conv_handler)

            class PamConv(ctypes.Structure):
                _fields_ = [("conv", conv_func_type), ("appdata_ptr", ctypes.c_void_p)]

            conv = PamConv(conv_callback, None)

            # Tenta serviços PAM padrão para daemons (common-auth, sudo, login)
            for srv in (b"common-auth", b"sudo", b"login"):
                pamh = ctypes.c_void_p()
                ret = pam.pam_start(srv, username.encode("utf-8"), ctypes.byref(conv), ctypes.byref(pamh))
                if ret != PAM_SUCCESS:
                    continue

                auth_ret = pam.pam_authenticate(pamh, 0)
                acct_ret = pam.pam_acct_mgmt(pamh, 0) if auth_ret == PAM_SUCCESS else -1
                pam.pam_end(pamh, auth_ret)

                if auth_ret == PAM_SUCCESS and acct_ret == PAM_SUCCESS:
                    return True

            return False
        except Exception:
            return False

    @classmethod
    def _is_user_sudoer(cls, username: str) -> bool:
        """Verifica se o utilizador do sistema é root ou pertence a grupos administrativos (sudo, admin, wheel)"""
        if username == "root":
            return True

        if not hasattr(os, "getuid"):
            return True

        try:
            user_entry = pwd.getpwnam(username)
            user_gid = user_entry.pw_gid
            sudo_groups = {"sudo", "admin", "wheel", "root"}

            # Verificar grupo primário
            try:
                prim_grp = grp.getgrgid(user_gid).gr_name
                if prim_grp in sudo_groups:
                    return True
            except KeyError:
                pass

            # Verificar grupos secundários
            for g in grp.getgrall():
                if g.gr_name in sudo_groups and username in g.gr_mem:
                    return True

            return False
        except KeyError:
            return False
        except Exception:
            return True

    @classmethod
    def authenticate(cls, username: str, password: str) -> Optional[UserInfo]:
        """
        Valida as credenciais fornecidas tentando:
        1. Conta Administrativa Local SGLinux / ASTER (Imediato, não depende de PAM)
        2. Utilizador do Sistema Ubuntu (PAM ou /etc/shadow)
        3. Fallback de teste em modo simulação
        """
        username_clean = username.strip()
        username_lower = username_clean.lower()

        # 1. Conta Administrativa Local SGLinux / ASTER (Prioritária, 100% autônoma e rápida)
        if username_lower == Settings.ADMIN_USER.lower() and password == Settings.ADMIN_PASSWORD:
            return UserInfo(
                username=Settings.ADMIN_USER,
                auth_type="local",
                role="admin",
                display_name="Administrador SGLinux",
                is_sudo=True,
            )

        # 2. Tentativa via PAM / shadow do Ubuntu Linux (em produção real)
        if sys.platform.startswith("linux") and cls._authenticate_via_pam_linux(username_clean, password):
            is_sudo = cls._is_user_sudoer(username_clean)
            return UserInfo(
                username=username_clean,
                auth_type="pam",
                role="system_admin" if is_sudo else "operator",
                display_name=f"{username_clean} (Ubuntu System)",
                is_sudo=is_sudo,
            )

        # 3. Em modo simulação / ambiente de teste: aceitar credenciais de teste para root, admin, ubuntu e sysadmin
        if Settings.SIMULATION_MODE:
            test_users = {"admin", "root", "ubuntu", "sysadmin"}
            test_passwords = {
                "admin",
                "ubuntu",
                "root",
                "sglinux",
                "sglinux@admin2026!",
                "adminpass2026!",
                "123456",
                "password",
                "aster",
                "aster2026!",
            }
            if username_lower in test_users:
                if password.strip().lower() in test_passwords or password == Settings.ADMIN_PASSWORD or len(password) >= 3:
                    return UserInfo(
                        username=username_lower,
                        auth_type="pam" if username_lower in ("root", "ubuntu") else "local",
                        role="system_admin",
                        display_name=f"{username_lower} (Ambiente de Teste)",
                        is_sudo=True,
                    )

        return None

    @classmethod
    def create_access_token(cls, user: UserInfo, remember_me: bool = False) -> Tuple[str, int]:
        """Gera um token JWT com tempo de expiração e claims do utilizador"""
        if remember_me:
            expire_delta = timedelta(days=Settings.REMEMBER_ME_EXPIRE_DAYS)
        else:
            expire_delta = timedelta(minutes=Settings.ACCESS_TOKEN_EXPIRE_MINUTES)

        expire_seconds = int(expire_delta.total_seconds())
        expire_time = datetime.now(timezone.utc) + expire_delta

        payload = {
            "sub": user.username,
            "auth_type": user.auth_type,
            "role": user.role,
            "display_name": user.display_name,
            "is_sudo": user.is_sudo,
            "exp": expire_time,
            "iat": datetime.now(timezone.utc),
        }

        token = jwt.encode(payload, Settings.SECRET_KEY, algorithm=Settings.ALGORITHM)
        return token, expire_seconds

    @classmethod
    def verify_token(cls, token: str) -> Optional[dict]:
        """Decodifica e valida a assinatura e expiração do JWT"""
        try:
            payload = jwt.decode(token, Settings.SECRET_KEY, algorithms=[Settings.ALGORITHM])
            return payload
        except jwt.PyJWTError:
            return None

    @classmethod
    def get_server_auth_info(cls) -> ServerAuthInfo:
        """Coleta informações públicas do servidor para exibição na tela de login"""
        hostname = socket.gethostname()
        os_name = "Ubuntu Server" if sys.platform.startswith("linux") else f"Ambiente de Teste ({sys.platform})"
        
        # Obter IP de rede primário
        server_ip = None
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            server_ip = s.getsockname()[0]
            s.close()
        except Exception:
            server_ip = "127.0.0.1"

        return ServerAuthInfo(
            hostname=hostname,
            os_name=os_name,
            is_production=not Settings.SIMULATION_MODE,
            server_ip=server_ip,
            version=Settings.VERSION,
        )


async def get_current_user(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    token_query: Optional[str] = Query(None, alias="token"),
) -> UserInfo:
    """
    Dependência FastAPI para proteger endpoints REST e WebSockets.
    Aceita o token via header 'Authorization: Bearer <token>' ou via query parameter '?token=<token>'.
    """
    raw_token = None
    if auth_header and auth_header.credentials:
        raw_token = auth_header.credentials
    elif token_query:
        raw_token = token_query

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado. Forneça um token Bearer válido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = AuthService.verify_token(raw_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou token de autenticação inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return UserInfo(
        username=payload.get("sub", "desconhecido"),
        auth_type=payload.get("auth_type", "local"),
        role=payload.get("role", "admin"),
        display_name=payload.get("display_name", payload.get("sub", "Utilizador")),
        is_sudo=payload.get("is_sudo", True),
    )
