<script>
</script>

<div class="app">
    <header>
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
        background: #333;
        height: 3em;
        display: flex;
        align-items: center;
        position: absolute; /* Changed from relative to absolute */
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
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
