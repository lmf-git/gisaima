<script>
  import { moveMapTo } from "../../lib/stores/map.js";

  const { 
    xAxisArray = [],
    yAxisArray = [],
    cols = 0,
    rows = 0
  } = $props();
  
  const moveX = x => moveMapTo(x, undefined);
  const moveY = y => moveMapTo(undefined, y);
</script>

<div class="axes">
  <div class="x">
    {#each xAxisArray as coord, i}
      <button 
        class="label" 
        class:center={coord.isCenter} 
        onclick={() => moveX(coord.value)}
        style="width: calc(100% / {cols}); --index: {i};">
        { coord.value }
      </button>
    {/each}
  </div>
  
  <div class="y">
    {#each yAxisArray as coord, i}
      <button 
        class="label" 
        class:center={coord.isCenter} 
        onclick={() => moveY(coord.value)}
        style="height: calc(100% / {rows}); --index: {i};">
        {coord.value}
      </button>
    {/each}
  </div>
</div>

<style>
  .axes {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3;
    opacity: 1;
  }
  
  .x {
    display: flex;
    position: absolute;
    bottom: 0;
    left: 0;
    width:100%;
    height: 2em;
    flex-direction: row;
  }
  
  .y {
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    width: 2em;
    height: 100%;
    flex-direction: column;
  }
  
  .label {   
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.8);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    pointer-events: auto;
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    background-color: rgba(255, 255, 255, 0.4);
    font-family: var(--font-body);
    font-weight: 400; /* Regular for most labels */
    opacity: 1;
    transition: background-color 0.2s ease, border-color 0.2s ease;
    cursor: pointer;

    appearance: none;
    padding: 0;
    margin: 0;
    text-align: inherit;
  }
  
  .label.center {
    font-weight: 700; /* Bold for central/important axes */
    font-family: var(--font-heading);
    background-color: rgba(192, 192, 192, 0.7);
    color: rgba(0, 0, 0, 0.9);
    text-shadow: 0 0 0.1875em rgba(255, 255, 255, 0.8);
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  .label:hover {
    background-color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 0.3em rgba(255, 255, 255, 0.5);
  }
</style>


