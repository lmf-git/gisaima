<script>
  const { size = '1em', extraClass = '' } = $props();
</script>

<svg 
  class="back-icon {extraClass}" 
  viewBox="0 0 24 24" 
  width={size} 
  height={size} 
  aria-hidden="true"
>
  <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" fill="currentColor" />
</svg>

<style>
  .back-icon {
    display: inline-block;
    vertical-align: middle;
    transition: transform 0.2s ease;
  }
  
  .back-icon:hover {
    transform: scale(1.1);
  }
  
  :global(.back-icon-dark) {
    fill: rgba(0, 0, 0, 0.8);
  }
</style>
