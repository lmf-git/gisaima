import { writable, derived } from 'svelte/store'

// Empty map store that will be initialized later based on screen dimensions
export const mapStore = writable({
  grid: [],
  rows: 0,
  columns: 0,
  initialized: false
})

// Initialize map with dimensions that fit the screen
export function initializeMap(containerWidth, containerHeight, tileSize) {
  // Calculate how many rows and columns can fit in the container
  const columns = Math.floor(containerWidth / tileSize)
  const rows = Math.floor(containerHeight / tileSize)
  
  // Create grid with calculated dimensions
  const grid = Array(rows).fill().map(() => Array(columns).fill(0))
  
  mapStore.update(state => ({
    ...state,
    grid,
    rows,
    columns,
    initialized: true
  }))
  
  console.log(`Map initialized with ${rows}×${columns} grid`)
  return { rows, columns }
}

// Derived store for the grid that only updates when dimensions change
export const gridData = derived(
  mapStore,
  $mapStore => $mapStore.grid
)

// Resize map when container dimensions change
export function resizeMap(containerWidth, containerHeight, tileSize) {
  const columns = Math.floor(containerWidth / tileSize)
  const rows = Math.floor(containerHeight / tileSize)
  
  mapStore.update(state => {
    // Only rebuild grid if dimensions changed
    if (state.rows !== rows || state.columns !== columns) {
      const grid = Array(rows).fill().map(() => Array(columns).fill(0))
      return { ...state, grid, rows, columns }
    }
    return state
  })
}
