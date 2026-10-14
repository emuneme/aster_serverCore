<template>
  <div class="login-wrapper">
    <!-- Background Decorativo -->
    <div class="glow-orb orb-cyan"></div>
    <div class="glow-orb orb-indigo"></div>
    <div class="glow-orb orb-emerald"></div>

    <!-- Card Central Glassmorphism -->
    <div class="login-card">
      <div class="accent-bar"></div>

      <!-- Header -->
      <div class="card-header">
        <div class="logo-box">
          <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
            <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
            <line x1="6" x2="6.01" y1="6" y2="6" />
            <line x1="6" x2="6.01" y1="18" y2="18" />
          </svg>
        </div>
        <h1 class="brand-title">SGLinux <span class="badge-v">v1.0</span></h1>
        <p class="brand-subtitle">Gestão e Orquestração de Infraestrutura Ubuntu Server</p>

        <!-- Status Hostname -->
        <div class="server-badge">
          <span class="ping-dot"></span>
          <span class="host-text">{{ serverInfo?.hostname || 'ubuntu-server' }}</span>
          <span class="divider">|</span>
          <span class="ip-text">{{ serverInfo?.server_ip || '127.0.0.1' }}</span>
        </div>
      </div>

      <!-- Seletor de Modo Híbrido -->
      <div class="auth-tabs">
        <button
          type="button"
          :class="['tab-btn', { active: authMode === 'pam' }]"
          @click="setMode('pam')"
        >
          <span>🖥️ Ubuntu (PAM / sudo)</span>
        </button>
        <button
          type="button"
          :class="['tab-btn', { active: authMode === 'local' }]"
          @click="setMode('local')"
        >
          <span>🛡️ Admin SGLinux</span>
        </button>
      </div>

      <p class="mode-desc">
        <span v-if="authMode === 'pam'">
          Autentique com a sua conta do sistema Ubuntu Server (ex: <code>root</code> ou conta do grupo <code>sudo</code>).
        </span>
        <span v-else>
          Acesso administrativo interno do SGLinux (padrão: <code>admin</code>).
        </span>
      </p>

      <!-- Erro -->
      <div v-if="errorMsg" class="error-banner">
        ⚠️ {{ errorMsg }}
      </div>

      <!-- Formulário -->
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="input-group">
          <label class="input-label">Nome de Utilizador</label>
          <input
            v-model="username"
            type="text"
            required
            placeholder="ex: root, ubuntu ou admin"
            class="form-input"
          />
        </div>

        <div class="input-group">
          <label class="input-label">Palavra-passe</label>
          <div class="pass-wrapper">
            <input
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              required
              placeholder="Insira a sua senha"
              class="form-input"
            />
            <button type="button" class="eye-btn" @click="showPass = !showPass">
              {{ showPass ? '👁️' : '🔒' }}
            </button>
          </div>
        </div>

        <div class="options-row">
          <label class="remember-label">
            <input v-model="rememberMe" type="checkbox" />
            <span>Manter sessão iniciada (30 dias)</span>
          </label>
          <span class="crypto-tag">JWT HS256</span>
        </div>

        <button type="submit" :disabled="isLoading" class="submit-btn">
          <span v-if="isLoading">A autenticar no servidor...</span>
          <span v-else>Entrar no Painel de Controlo →</span>
        </button>
      </form>

      <!-- Atalhos de Demonstração -->
      <div class="demo-box">
        <span class="demo-title">Credenciais Rápidas de Acesso:</span>
        <div class="demo-buttons">
          <button type="button" @click="fill('root', 'root')">
            <strong>Ubuntu root</strong>
            <small>root / root</small>
          </button>
          <button type="button" @click="fill('admin', 'SGLinux@Admin2026!')">
            <strong>SGLinux Admin</strong>
            <small>admin / SGLinux@...</small>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, authStorage, type ServerAuthInfo, type UserInfo } from '../services/api';

const emit = defineEmits<{
  (e: 'login-success', user: UserInfo): void;
}>();

const username = ref('');
const password = ref('');
const rememberMe = ref(true);
const showPass = ref(false);
const authMode = ref<'pam' | 'local'>('pam');
const isLoading = ref(false);
const errorMsg = ref<string | null>(null);
const serverInfo = ref<ServerAuthInfo | null>(null);

onMounted(async () => {
  try {
    serverInfo.value = await api.getAuthStatus();
  } catch {
    serverInfo.value = {
      hostname: 'ubuntu-server',
      os_name: 'Ubuntu Server',
      is_production: true,
      server_ip: '127.0.0.1',
      version: '1.0.0',
    };
  }
});

const setMode = (mode: 'pam' | 'local') => {
  authMode.value = mode;
  errorMsg.value = null;
  if (mode === 'local') {
    username.value = 'admin';
    password.value = 'SGLinux@Admin2026!';
  } else {
    username.value = '';
    password.value = '';
  }
};

const fill = (u: string, p: string) => {
  username.value = u;
  password.value = p;
  errorMsg.value = null;
};

const handleLogin = async () => {
  if (!username.value || !password.value) return;
  isLoading.value = true;
  errorMsg.value = null;
  try {
    const resp = await api.login({
      username: username.value.trim(),
      password: password.value,
      remember_me: rememberMe.value,
    });
    authStorage.setSession(resp, rememberMe.value);
    emit('login-success', resp.user_info);
  } catch (err: any) {
    errorMsg.value = err.message || 'Credenciais inválidas.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background-color: #020617;
  position: relative;
  overflow: hidden;
  color: #f8fafc;
  font-family: inherit;
}
.glow-orb {
  position: absolute;
  border-radius: 9999px;
  pointer-events: none;
}
.orb-cyan {
  top: -100px;
  left: -100px;
  width: 400px;
  height: 400px;
  background: rgba(6, 182, 212, 0.15);
  filter: blur(120px);
}
.orb-indigo {
  top: 30%;
  right: -50px;
  width: 450px;
  height: 450px;
  background: rgba(99, 102, 241, 0.15);
  filter: blur(130px);
}
.orb-emerald {
  bottom: -100px;
  left: 30%;
  width: 350px;
  height: 350px;
  background: rgba(16, 185, 129, 0.12);
  filter: blur(120px);
}
.login-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 480px;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(51, 65, 85, 0.7);
  border-radius: 1.5rem;
  padding: 2rem 2.25rem;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.8);
}
.accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: linear-gradient(to right, #06b6d4, #6366f1, #10b981);
  border-top-left-radius: 1.5rem;
  border-top-right-radius: 1.5rem;
}
.card-header {
  text-align: center;
  margin-bottom: 1.5rem;
}
.logo-box {
  display: inline-flex;
  padding: 0.75rem;
  border-radius: 1rem;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  margin-bottom: 0.5rem;
}
.logo-icon {
  width: 2rem;
  height: 2rem;
  color: #38bdf8;
}
.brand-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #ffffff;
}
.badge-v {
  font-size: 0.65rem;
  padding: 0.15rem 0.4rem;
  background: #312e81;
  color: #a5b4fc;
  border-radius: 9999px;
  border: 1px solid #4338ca;
}
.brand-subtitle {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}
.server-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  margin-top: 0.75rem;
  background: rgba(2, 6, 23, 0.8);
  border: 1px solid #1e293b;
  border-radius: 9999px;
  font-size: 0.7rem;
}
.ping-dot {
  width: 0.5rem;
  height: 0.5rem;
  background: #10b981;
  border-radius: 9999px;
}
.host-text {
  color: #34d399;
  font-family: monospace;
}
.divider {
  color: #475569;
}
.ip-text {
  color: #94a3b8;
}
.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  background: rgba(2, 6, 23, 0.8);
  padding: 0.25rem;
  border-radius: 0.75rem;
  border: 1px solid #1e293b;
  margin-bottom: 0.5rem;
}
.tab-btn {
  padding: 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active {
  background: linear-gradient(to right, #4f46e5, #0284c7);
  color: #ffffff;
}
.mode-desc {
  font-size: 0.7rem;
  color: #94a3b8;
  text-align: center;
  margin-bottom: 1.25rem;
}
.mode-desc code {
  color: #7dd3fc;
  font-family: monospace;
}
.error-banner {
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.3);
  color: #fda4af;
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  margin-bottom: 1rem;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.input-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #cbd5e1;
}
.form-input {
  width: 100%;
  background: rgba(2, 6, 23, 0.9);
  border: 1px solid #334155;
  border-radius: 0.6rem;
  padding: 0.65rem 0.75rem;
  font-size: 0.75rem;
  color: #ffffff;
  outline: none;
  transition: border-color 0.2s;
}
.form-input:focus {
  border-color: #6366f1;
}
.pass-wrapper {
  position: relative;
}
.eye-btn {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
}
.options-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #94a3b8;
}
.remember-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
}
.crypto-tag {
  color: #64748b;
  font-family: monospace;
}
.submit-btn {
  background: linear-gradient(to right, #6366f1, #0284c7, #10b981);
  border: none;
  border-radius: 0.6rem;
  padding: 0.75rem;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  transition: opacity 0.2s;
  box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.3);
}
.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.demo-box {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #1e293b;
}
.demo-title {
  display: block;
  font-size: 0.7rem;
  color: #94a3b8;
  text-align: center;
  margin-bottom: 0.5rem;
}
.demo-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.demo-buttons button {
  background: rgba(2, 6, 23, 0.7);
  border: 1px solid #1e293b;
  border-radius: 0.5rem;
  padding: 0.4rem;
  text-align: left;
  cursor: pointer;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
}
.demo-buttons button:hover {
  border-color: #334155;
}
.demo-buttons strong {
  font-size: 0.7rem;
  color: #38bdf8;
}
.demo-buttons small {
  font-size: 0.65rem;
  color: #64748b;
}
</style>
