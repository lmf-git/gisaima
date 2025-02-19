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
        position: relative;
        z-index: 100;
        flex: 0 0 3em;
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
