<script setup>
// Значки погоды — простые SVG без внешних картинок: sun | partly | cloud | rain | snow | storm | fog.
defineProps({ kind: { type: String, default: 'cloud' } })
const CLOUD = 'M20 50a12 12 0 0 1 1-24 16 16 0 0 1 30-3 14 14 0 0 1 3 27z'
</script>

<template>
  <svg class="wi" viewBox="0 0 72 72" aria-hidden="true">
    <template v-if="kind === 'sun'">
      <g stroke="#ffd24a" stroke-width="4" stroke-linecap="round">
        <path v-for="a in 8" :key="a" d="M36 6v8" :transform="`rotate(${(a - 1) * 45} 36 36)`" />
      </g>
      <circle cx="36" cy="36" r="13" fill="#ffd24a" />
    </template>
    <template v-else-if="kind === 'partly'">
      <g stroke="#ffd24a" stroke-width="3.5" stroke-linecap="round">
        <path v-for="a in 8" :key="a" d="M26 4v6" :transform="`rotate(${(a - 1) * 45} 26 24)`" />
      </g>
      <circle cx="26" cy="24" r="10" fill="#ffd24a" />
      <path :d="CLOUD" transform="translate(4 8)" fill="#eef3fa" />
    </template>
    <template v-else>
      <path :d="CLOUD" :transform="kind === 'cloud' || kind === 'fog' ? 'translate(2 -2)' : 'translate(2 -8)'" :fill="kind === 'storm' ? '#b9c3d3' : '#eef3fa'" />
      <g v-if="kind === 'rain'" stroke="#6cc0ff" stroke-width="4" stroke-linecap="round">
        <path d="M24 52l-3 9M37 52l-3 9M50 52l-3 9" />
      </g>
      <g v-else-if="kind === 'snow'" fill="#fff">
        <circle cx="24" cy="54" r="3.2" />
        <circle cx="37" cy="60" r="3.2" />
        <circle cx="50" cy="54" r="3.2" />
      </g>
      <path v-else-if="kind === 'storm'" d="M40 38L28 56h9l-4 14 14-20h-9z" fill="#ffd24a" />
      <g v-else-if="kind === 'fog'" stroke="#dbe4f0" stroke-width="4" stroke-linecap="round" opacity="0.9">
        <path d="M14 52h44M20 61h44" />
      </g>
    </template>
  </svg>
</template>

<style scoped>
.wi {
  display: block;
  width: 1em;
  height: 1em;
  overflow: visible;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
}
</style>
