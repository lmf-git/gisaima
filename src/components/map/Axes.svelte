<script>
  import { mapState } from '../../lib/stores/map.js';
  
  // Generate arrays for x and y axis labels that exactly match grid cells (not grid lines)
  const xLabels = $derived(Array.from({ length: $mapState.cols }, (_, i) => 
    $mapState.centerCoord.x - Math.floor($mapState.cols / 2) + i
  ));
  
  const yLabels = $derived(Array.from({ length: $mapState.rows }, (_, i) => 
    $mapState.centerCoord.y - Math.floor($mapState.rows / 2) + i
  ));
</script>

<div class="axes">
  <div class="x-axis" style="--cell-count: {$mapState.cols}">
    {#each xLabels as x}
      <div class="tick" class:center={x === $mapState.centerCoord.x}>
        <div class="tick-mark"></div>
        <div class="tick-label">{x}</div>
      </div>
    {/each}
  </div>
  
  <div class="y-axis" style="--cell-count: {$mapState.rows}">
    {#each yLabels as y}
      <div class="tick" class:center={y === $mapState.centerCoord.y}>
        <div class="tick-label">{y}</div>
        <div class="tick-mark"></div>
      </div>
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
    z-index: 2;
  }

  .x-axis {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1.5em;
    display: grid;
    grid-template-columns: repeat(var(--cell-count), 1fr);
  }

  .y-axis {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 1.5em;
    display: grid;
    grid-template-rows: repeat(var(--cell-count), 1fr);
  }

  /* Center ticks with grid */
  .tick {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 0.75em;
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  }
  
  .y-axis .tick {
    flex-direction: row;
    justify-content: flex-start;
    padding-left: 0.25em;
  }
  
  .tick.center {
    color: rgba(255, 255, 255, 1);
    font-weight: bold;
  }

  .tick.center .tick-mark {
    background-color: rgba(255, 255, 255, 0.8);
  }

  .tick-mark {
    width: 6px;
    height: 1px;
    background-color: rgba(255, 255, 255, 0.4);
  }

  .x-axis .tick-mark {
    margin-bottom: 2px;
  }
  
  .y-axis .tick-mark {
    margin-left: 4px;
  }

  .tick-label {
    line-height: 1;
  }
</style>


