<script>
  // Customizable icon properties
  export let size = "1em";
  export let color = "currentColor";
  export let strokeWidth = 2;
  
  // Generate viewBox based on default size of 24
  const viewBox = "0 0 24 24";
</script>

<svg 
  xmlns="http://www.w3.org/2000/svg" 
  width={size} 
  height={size} 
  viewBox={viewBox}
  fill="none" 
  stroke={color} 
  stroke-width={strokeWidth} 
  stroke-linecap="round" 
  stroke-linejoin="round"
  {...$$restProps}
>
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>
