<script>
  const { size = '1em', extraClass = '' } = $props();
</script>

<svg 
  class="close-icon {extraClass}" 
  viewBox="0 0 24 24" 
  width={size} 
  height={size} 
  fill="none" 
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>

<style>
  .close-icon {
    display: inline-block;
    vertical-align: middle;
    transition: transform 0.2s ease;
  }
  
  .close-icon:hover {
    transform: scale(1.1);
  }
  
  /* Add specific styling for the dark variant */
  :global(.close-icon-dark) {
    stroke: rgba(0, 0, 0, 0.8);
  }
</style>
