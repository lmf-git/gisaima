<script>
  const { extraClass = '', size = '1em' } = $props();
</script>

<svg 
  class={extraClass}
  width={size}
  height={size}
  viewBox="0 0 24 24" 
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path fill="none" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
  <circle cx="12" cy="12" r="3"></circle>
</svg>