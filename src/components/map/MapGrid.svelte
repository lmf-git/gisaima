<script>
    import { userState } from '../../stores/user.js';
    import { onMount } from 'svelte';
    
    let mapElement;
    let zoomLevel = 1; // Start at 3x3 view
    let isReady = false;
    let isMobile = false;
    let perspectiveEnabled = true;
    
    export let x = 0;
    export let y = 0;

    // Center coordinates (can be any integer)
    $: centerChunk = {
        x: Math.floor(x / 18),
        y: Math.floor(y / 18)
    };

    // Update zoom range handling
    $: chunkRange = {
        0: [-2, 2],    // 6x6 around center chunk (furthest)
        1: [-1, 1],    // 3x3 around center chunk (default)
        ...(isMobile && { 2: [0, 0] })    // 1x1 (mobile only)
    }[zoomLevel];

    $: visibleChunks = [];
    $: {
        visibleChunks = [];
        for (let dx = chunkRange[0]; dx <= chunkRange[1]; dx++) {
            for (let dy = chunkRange[0]; dy <= chunkRange[1]; dy++) { // Fixed: changed dx to dy in condition
                visibleChunks.push({
                    x: centerChunk.x + dx,
                    y: centerChunk.y + dy
                });
            }
        }
    }

    function calculateDelay(tileX, tileY, centerX, centerY) {
        // Calculate distance without rotation influence
        const dx = tileX - centerX;
        const dy = tileY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance * 25;
    }

    // Generate chunk data with correct coordinates
    $: allChunkData = visibleChunks.map(chunk => ({
        ...chunk,
        data: Array(18).fill(0).map((_, i) => 
            Array(18).fill(0).map((_, j) => {
                const absoluteX = (chunk.x * 18) + i;
                const absoluteY = (chunk.y * 18) + j;
                const delay = calculateDelay(absoluteX, absoluteY, x, y);
                const isCurrent = absoluteX === x && absoluteY === y;
                
                return {
                    x: absoluteX,
                    y: absoluteY,
                    isCurrent,
                    delay
                };
            })
        )
    }));

    // Update zoom divisors with more extreme difference for 6x
    $: zoomDivisor = {
        0: 12.0,   // extremely tiny tiles (furthest - 6x6)
        1: 2.5,    // medium tiles (3x3)
        ...(isMobile && { 2: 0.6 })    // huge tiles (mobile only - 1x1)
    }[zoomLevel];

    function calculateSize() {
        const dvmin = Math.min(window.innerWidth, window.innerHeight) / 100;
        return Math.min(dvmin * zoomDivisor, 6); // removed min limit, keep max at 6em
    }

    $: if (mapElement) {
        const size = calculateSize();
        const gap = size * 0.083; // Calculate gap size
        mapElement.style.setProperty('--tile-size', `${size}em`);
        mapElement.style.setProperty('--base-size', `${size}em`);
        
        // Include gap in base offset calculation
        const baseOffset = (size + gap) * -0.5;
        if (perspectiveEnabled) {
            // Further increased X offset to move plane more right
            const xOffset = baseOffset * 2.2;     // Increased from 2.0 to 2.2
            const yOffset = baseOffset * 1.15;    // Keep Y the same
            mapElement.style.setProperty('--offset-x', `${xOffset}em`);
            mapElement.style.setProperty('--offset-y', `${yOffset}em`);
        } else {
            mapElement.style.setProperty('--offset-x', `${baseOffset}em`);
            mapElement.style.setProperty('--offset-y', `${baseOffset}em`);
        }

        mapElement.style.setProperty('--rotate-x', perspectiveEnabled ? '60deg' : '10deg');
        mapElement.style.setProperty('--rotate-z', perspectiveEnabled ? '45deg' : '0deg');
        mapElement.style.setProperty('--perspective', perspectiveEnabled ? '1000px' : '4000px');
        isReady = true;
    }

    onMount(() => {
        // Add mobile check
        const checkMobile = () => {
            const wasMobile = isMobile;
            isMobile = window.innerWidth < 768;
            
            // Set zoom level automatically based on screen size
            if (isMobile && !wasMobile) {
                zoomLevel = 2; // 1x1 view on mobile
            } else if (!isMobile && wasMobile) {
                zoomLevel = 1; // 3x3 view on desktop
            }
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        const resizeObserver = new ResizeObserver(() => {
            const size = calculateSize();
            mapElement.style.setProperty('--tile-size', `${size}em`);
            mapElement.style.setProperty('--base-size', `${size}em`);
        });
        resizeObserver.observe(document.documentElement);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', checkMobile);
        };
    });
</script>

<div class="wrapper">
    <div class="map" 
        bind:this={mapElement}
    >
        {#if isReady}
            {#each allChunkData as chunk}
                <div 
                    class="chunk" 
                    style="transform: translate(
                        calc({chunk.x - centerChunk.x} * (18 * var(--tile-size) + 18 * calc(var(--tile-size) * 0.083))),
                        calc({chunk.y - centerChunk.y} * (18 * var(--tile-size) + 18 * calc(var(--tile-size) * 0.083)))
                    )">
                    {#each chunk.data as row}
                        {#each row as cell}
                            <div 
                                class="tile" 
                                class:current={cell.isCurrent}
                                style="
                                    animation-delay: {cell.delay}ms;
                                    transform: {cell.offset};
                                "
                            >
                                {cell.x},{cell.y}
                            </div>
                        {/each}
                    {/each}
                </div>
            {/each}
        {/if}
    </div>
</div>

{#if !isMobile}
    <div class="zoom-controls">
        <button class:active={zoomLevel === 0} on:click={() => zoomLevel = 0}>6x</button>
        <button class:active={zoomLevel === 1} on:click={() => zoomLevel = 1}>3x</button>
    </div>
    <div class="perspective-toggle">
        <button on:click={() => perspectiveEnabled = !perspectiveEnabled}>
            {perspectiveEnabled ? '2D' : '3D'}
        </button>
    </div>
{/if}

<style>
    :global(body) {
        perspective: calc(100dvw * 0.6);
    }

    .wrapper {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        z-index: 1;
        perspective: var(--perspective, 1000px);
        perspective-origin: 45% 45%;  /* Adjusted perspective origin for better centering */
        transition: perspective 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @media (max-width: 768px) {
        .wrapper {
            overflow: hidden;
        }
    }

    .map {
        --tile-size: 3.75em;
        --base-size: 3.75em;
        --rotate-x: 60deg;
        --rotate-z: 45deg;
        --offset-x: 0;
        --offset-y: 0;
        position: relative;
        transform-style: preserve-3d;
        transform-origin: center center;
        transform: 
            translate(var(--offset-x), var(--offset-y))
            rotateX(var(--rotate-x)) 
            rotateZ(var(--rotate-z));
        transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        will-change: transform;
    }

    .chunk {
        position: absolute;
        display: grid;
        grid-template-columns: repeat(18, var(--tile-size));
        grid-auto-rows: var(--tile-size);
        gap: calc(var(--tile-size) * 0.083);
        width: fit-content;
        transition: all 0.3s ease-out;
    }

    .zoom-controls {
        position: fixed;
        bottom: 1em;
        right: 1em;
        display: flex;
        gap: 0.5em;
        z-index: 50;
    }

    .perspective-toggle {
        position: fixed;
        bottom: 1em;
        left: 1em;
        z-index: 50;
    }

    button {
        padding: 0.5em 1em;
        background: #333;
        border: none;
        color: white;
        cursor: pointer;
        border-radius: 0.25em;
    }

    button.active {
        background: #3498db;
    }

    .tile {
        width: 100%;
        height: 100%;
        background: #3498db;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: Arial, sans-serif;
        color: white;
        font-weight: bold;
        border: 0.0625em solid #2980b9;
        animation: tileReveal 0.4s cubic-bezier(0.4, 0, 0.2, 1) backwards;
        backface-visibility: hidden;
    }

    .tile.current {
        background: #e74c3c;
        z-index: 1;
    }

    @keyframes tileReveal {
        0% {
            opacity: 0;
            transform: translateZ(-0.5em);
        }
        100% {
            opacity: 1;
            transform: translateZ(0);
        }
    }
</style>
