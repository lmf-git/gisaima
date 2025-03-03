<script>
    import { page } from '$app/stores';
    
    // Check if current page is the map page
    $: isMapPage = $page.url.pathname === '/map';
</script>

<div class="app">
    <header class={isMapPage ? 'absolute' : ''}>
        <nav>
            <a href="/">Home</a>
            <a href="/map">Map</a>
        </nav>
    </header>

    <slot />
</div>

<style>
    :global(*) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    .app {
        display: flex;
        flex-direction: column;
        height: 100dvh;
        overflow: hidden;
    }

    header {
        height: 3em;
        display: flex;
        align-items: center;
        z-index: 100;
    }

    header.absolute {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
    }

    nav {
        display: flex;
        gap: 1rem;
        padding: 0 1em;
    }

    a {
        color: white;
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }
</style>
