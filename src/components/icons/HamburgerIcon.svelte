<script>
  // Accept props for customization with extraClass instead of className
  const { size = "24px", extraClass = "", active = false } = $props();
</script>

<div 
  class="hamburger {extraClass}" 
  class:active={active}
  style="width: {size}; height: calc({size} * 0.75);"
>
  <span></span>
  <span></span>
  <span></span>
</div>

<style>
  .hamburger {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .hamburger span {
    display: block;
    height: 3px;
    width: 100%;
    border-radius: 3px;
    transition: all 0.3s ease;
  }

  .hamburger.active span:nth-child(1) {
    transform: translateY(calc(0.4 * var(--span-distance))) rotate(45deg);
  }

  .hamburger.active span:nth-child(2) {
    opacity: 0;
  }

  .hamburger.active span:nth-child(3) {
    transform: translateY(calc(-0.4 * var(--span-distance))) rotate(-45deg);
  }

  /* Dynamic variable for better position calculation */
  .hamburger {
    --span-distance: calc(0.75 * var(--size, 24px));
  }
</style>
