<script setup lang="ts">
import { ref, computed } from 'vue'
const a = ref(0)
const doubled = computed(() => a.value * 2)
</script>

<template>
  <div>{{ a }} x 2 = {{ doubled }}</div>
</template>
