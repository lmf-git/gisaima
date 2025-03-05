<script>
  export let size = 'medium'; // small, medium, large
  
  const sizes = {
    small: '50px',
    medium: '100px',
    large: '150px'
  };
  
  const width = sizes[size] || sizes.medium;
</script>

<div class="logo" style="width: {width}; height: {width};">
  <div class="symbol">G</div>
</div>

<style>
  .logo {
    margin: 0 auto;
    border-radius: 50%;
    background: linear-gradient(135deg, #4299e1, #2a4365);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
  
  .symbol {
    color: white;
    font-weight: bold;
    font-size: 3em;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  }
</style>
