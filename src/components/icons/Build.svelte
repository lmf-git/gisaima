<script>
  const { size = '1em', extraClass = '' } = $props();
</script>

<svg 
  class="build-icon {extraClass}" 
  viewBox="0 0 512 512" 
  width={size} 
  height={size} 
  aria-hidden="true"
>
  <!-- Building/construction icon -->
  <g>
    <!-- Foundation/base -->
    <rect x="50" y="380" width="412" height="40" fill="#8B7E78" />
    
    <!-- Building frame -->
    <rect x="100" y="180" width="312" height="200" fill="#DFDFE2" />
    
    <!-- Roof -->
    <polygon points="256,100 80,180 432,180" fill="#57545C" />
    
    <!-- Windows -->
    <rect x="130" y="220" width="60" height="70" fill="#6BB4FE" />
    <rect x="220" y="220" width="60" height="70" fill="#6BB4FE" />
    <rect x="310" y="220" width="60" height="70" fill="#6BB4FE" />
    
    <!-- Door -->
    <rect x="220" y="320" width="60" height="60" fill="#9E6C4F" />
    <circle cx="265" cy="350" r="5" fill="#57545C" />
    
    <!-- Construction elements -->
    <g>
      <!-- Hammer -->
      <rect x="370" y="300" width="20" height="70" transform="rotate(30, 370, 300)" fill="#9E6C4F" />
      <rect x="350" y="280" width="40" height="30" fill="#57545C" />
    </g>
  </g>
  
  <!-- Outline -->
  <path d="M472,370h-10V172.7c0-3.8-2.2-7.3-5.6-9c-3.4-1.7-7.5-1.2-10.4,1.1L256,315.2L65.9,164.7c-2.9-2.3-7-2.8-10.4-1.1
    c-3.4,1.7-5.6,5.2-5.6,9V370H40c-5.5,0-10,4.5-10,10v50c0,5.5,4.5,10,10,10h432c5.5,0,10-4.5,10-10v-50
    C482,374.5,477.5,370,472,370z M70,190.5l186,147.7c0.1,0,0.1,0.1,0.2,0.1c3.5,2.6,8.1,2.6,11.6,0c0.1,0,0.1-0.1,0.2-0.1
    l186-147.7V370H330v-50c0-5.5-4.5-10-10-10h-10V220c0-5.5-4.5-10-10-10h-70c-5.5,0-10,4.5-10,10v90h-10c-5.5,0-10,4.5-10,10
    v50H70V190.5z M280,230h50v80h-50V230z M240,330h70v40h-70V330z M462,420H50v-30h412V420z" fill="#2F2D30"/>
  
  <!-- Hammer overlay -->
  <path d="M380,260c-5.5,0-10,4.5-10,10c0,5.5,4.5,10,10,10h20c5.5,0,10-4.5,10-10c0-5.5-4.5-10-10-10h-10c0-5.5-4.5-10-10-10
    c-5.5,0-10,4.5-10,10v0.5c0,2.8,2.2,5,5,5S380,257.8,380,255V260z M390,320l-20,30c-2.8,4.2-1.7,9.8,2.5,12.6
    c1.5,1,3.2,1.5,4.9,1.5c3,0,5.9-1.3,7.7-3.9l20-30c2.8-4.2,1.7-9.8-2.5-12.6C398.5,314.7,392.8,315.8,390,320z" fill="#2F2D30"/>
</svg>

<style>
  .build-icon {
    display: inline-block;
    vertical-align: middle;
    transition: transform 0.2s ease;
  }
  
  .build-icon:hover {
    transform: scale(1.1);
  }
  
  :global(.build-icon-dark) {
    fill: rgba(0, 0, 0, 0.8);
  }
</style>
