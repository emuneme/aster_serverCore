<template>
  <div :class="['aster-logo-container', sizeClass, className]">
    <!-- Símbolo SVG -->
    <div class="symbol-wrap">
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="logo-svg"
      >
        <rect
          x="28"
          y="12"
          width="58"
          height="58"
          rx="4"
          stroke="#F97316"
          stroke-width="6"
          fill="#F97316"
          fill-opacity="0.08"
        />
        <rect
          x="12"
          y="30"
          width="58"
          height="58"
          rx="4"
          stroke="#F97316"
          stroke-width="6"
          fill="#0F172A"
        />
        <line x1="12" y1="59" x2="70" y2="59" stroke="#F97316" stroke-width="3" stroke-dasharray="4 2" />
        <line x1="41" y1="30" x2="41" y2="88" stroke="#F97316" stroke-width="3" stroke-dasharray="4 2" />
        <path d="M41 42L28 76H36L39 67H43L46 76H54L41 42Z" fill="#F97316" />
        <polygon points="41,52 38.5,60 43.5,60" fill="#0F172A" />
        <circle cx="41" cy="59" r="4.5" fill="#0EA5E9" />
        <circle cx="41" cy="59" r="2" fill="#FFFFFF" />
        <circle cx="76" cy="22" r="4" fill="#0EA5E9" />
        <path d="M72 32L80 32" stroke="#0EA5E9" stroke-width="2.5" stroke-linecap="round" />
      </svg>
    </div>

    <!-- Textos -->
    <div v-if="variant !== 'icon'" class="text-wrap">
      <div class="title-row">
        <span class="aster-name"><span class="letter-a">A</span>STER</span>
        <span class="servercore-name">ServerCore</span>
        <span v-if="variant === 'full'" class="version-badge">v1.0</span>
      </div>
      <span v-if="showSlogan && variant === 'full'" class="slogan-text">
        GESTÃO E AUTOMAÇÃO DE SERVIDORES LINUX
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'full' | 'compact' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    showSlogan?: boolean;
    className?: string;
  }>(),
  {
    variant: 'full',
    size: 'md',
    showSlogan: true,
    className: '',
  }
);

const sizeClass = computed(() => `size-${props.size}`);
</script>

<style scoped>
.aster-logo-container {
  display: inline-flex;
  align-items: center;
  user-select: none;
}
.size-sm { gap: 0.5rem; }
.size-sm .symbol-wrap { width: 1.75rem; height: 1.75rem; }
.size-sm .aster-name, .size-sm .servercore-name { font-size: 1rem; }
.size-sm .slogan-text { font-size: 0.5rem; }

.size-md { gap: 0.75rem; }
.size-md .symbol-wrap { width: 2.25rem; height: 2.25rem; }
.size-md .aster-name, .size-md .servercore-name { font-size: 1.25rem; }
.size-md .slogan-text { font-size: 0.55rem; }

.size-lg { gap: 1rem; }
.size-lg .symbol-wrap { width: 3.5rem; height: 3.5rem; }
.size-lg .aster-name, .size-lg .servercore-name { font-size: 1.875rem; }
.size-lg .slogan-text { font-size: 0.7rem; }

.symbol-wrap {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo-svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 8px rgba(249, 115, 22, 0.35));
}
.text-wrap {
  display: flex;
  flex-direction: column;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  line-height: 1;
}
.aster-name {
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -0.025em;
}
.letter-a {
  color: #f97316;
}
.servercore-name {
  font-weight: 700;
  color: #38bdf8;
  letter-spacing: -0.025em;
}
.version-badge {
  font-size: 0.55rem;
  font-family: monospace;
  padding: 0.1rem 0.35rem;
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  border-radius: 0.25rem;
  margin-left: 0.25rem;
}
.slogan-text {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-top: 0.25rem;
  font-family: monospace;
}
</style>
