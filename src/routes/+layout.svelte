<script>
</script>

<div class="app">
    <header>
        <nav>
            <a href="/">Home</a>
            <a href="/map">Map</a>
        </nav>
    </header>
    <main>
        <slot />
    </main>
</div>

<style>
    .app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
    }

    main {
        flex: 1;
        padding: 1rem;
    }

    header {
        background: #333;
        padding: 1rem;
    }

    nav {
        display: flex;
        gap: 1rem;
    }

    a {
        color: white;
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }
</style>
