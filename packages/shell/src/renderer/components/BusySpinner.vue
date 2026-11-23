<!-- A small turning ring shown with a message while something is in progress; it stays still when the system asks for reduced motion. -->
<template>
  <span
    class="busy-spinner"
    aria-hidden="true"
  />
</template>

<style scoped>
.busy-spinner {
  display: inline-block;
  flex: none;
  box-sizing: border-box;
  inline-size: 1.5em;
  block-size: 1.5em;
  border: 2px solid currentcolor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  opacity: 0.7;
  animation: busy-spin 0.9s linear infinite;
}

@keyframes busy-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .busy-spinner {
    animation: none;
  }
}
</style>
