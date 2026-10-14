from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas import LoginRequest, LoginResponse, ServerAuthInfo, UserInfo
from app.services.auth import AuthService, get_current_user

router = APIRouter(prefix="/auth", tags=["Autenticação & Sessão"])


@router.get("/status", response_model=ServerAuthInfo, summary="Informações públicas do servidor para a tela de Login")
async def get_server_status():
    """
    Retorna o nome da máquina (hostname), versão do sistema operacional e se está em modo de produção.
    Não requer autenticação prévia (usado na renderização inicial da tela de login).
    """
    return AuthService.get_server_auth_info()


@router.post("/login", response_model=LoginResponse, summary="Autenticação Híbrida (Ubuntu PAM ou SGLinux Admin)")
async def login(request: LoginRequest):
    """
    Valida as credenciais fornecidas:
    1. Utilizador do Sistema Ubuntu (PAM): Qualquer utilizador do SO com permissões de sudo ou root.
    2. Utilizador Local SGLinux (Fallback): Conta de administração padrão para primeiro acesso.
    Retorna o token JWT e metadados de utilizador e servidor.
    """
    user = AuthService.authenticate(request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas. Verifique o utilizador e a senha.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token, expires_in = AuthService.create_access_token(user, remember_me=request.remember_me)
    server_info = AuthService.get_server_auth_info()

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        user_info=user,
        server_info=server_info,
    )


@router.get("/me", response_model=UserInfo, summary="Dados do utilizador atualmente autenticado")
async def get_current_user_profile(user: UserInfo = Depends(get_current_user)):
    """Retorna os detalhes do utilizador autenticado a partir do token JWT Bearer."""
    return user


@router.post("/logout", summary="Encerrar sessão de utilizador")
async def logout(user: UserInfo = Depends(get_current_user)):
    """Invalida a sessão ativa."""
    return {"message": "Sessão encerrada com sucesso.", "username": user.username}
