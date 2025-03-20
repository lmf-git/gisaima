<script>
    import SignOut from './icons/SignOut.svelte';
    
    // Props
    const { onClose, currentPath, user, signOut } = $props();
</script>

<div class="mobile-menu">
    <div class="mobile-menu-header">
        <h2>Menu</h2>
        <button class="close-button" onclick={onClose} aria-label="Close menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    </div>
    
    <nav class="mobile-nav">
        {#if currentPath !== '/'}
            <a href="/" class:active={currentPath === '/'}>Home</a>
        {/if}
        {#if currentPath !== '/worlds'}
            <a href="/worlds" class:active={currentPath === '/worlds'}>Worlds</a>
        {/if}
        {#if currentPath !== '/map'}
            <a href="/map" class:active={currentPath === '/map'}>Map</a>
        {/if}
        {#if currentPath !== '/about'}
            <a href="/about" class:active={currentPath === '/about'}>About</a>
        {/if}
    </nav>
    
    <div class="mobile-auth">
        {#if user}
            <div class="mobile-user-info">
                <p>Signed in as:</p>
                <p class="user-email">{user.displayName || user.email}</p>
            </div>
            <button class="mobile-signout" onclick={signOut}>
                <SignOut size="1.2em" extraClass="icon-pale-green" />
                <span>Sign Out</span>
            </button>
        {:else}
            <div class="auth-buttons">
                <a href="/login" class="login">Log In</a>
                <a href="/signup" class="signup">Sign Up</a>
            </div>
        {/if}
    </div>
</div>

<style>
    .mobile-menu-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(10, 25, 47, 0.85);
        backdrop-filter: blur(5px);
        z-index: 100;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    
    .mobile-menu {
        width: 85%;
        max-width: 400px;
        background-color: var(--color-dark-blue);
        border-radius: 8px;
        border: 1px solid var(--color-panel-border);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        max-height: 80vh;
        overflow-y: auto;
    }
    
    .mobile-menu-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-panel-border);
    }
    
    .mobile-menu-header h2 {
        color: var(--color-bright-accent);
        margin: 0;
        font-family: var(--font-heading);
        font-weight: 400;
        letter-spacing: 0.1em;
    }
    
    .close-button {
        background: transparent;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 50%;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .close-button:hover {
        color: var(--color-bright-accent);
        background-color: rgba(100, 255, 218, 0.1);
    }
    
    .mobile-nav {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .mobile-nav a {
        color: var(--color-text-secondary);
        text-decoration: none;
        font-size: 1.3rem;
        padding: 0.8rem 0.5rem;
        border-radius: 4px;
        transition: all 0.2s ease;
        font-weight: 500;
        text-align: center;
    }
    
    .mobile-nav a:hover,
    .mobile-nav a.active {
        color: var(--color-bright-accent);
        background-color: rgba(100, 255, 218, 0.05);
    }
    
    .mobile-auth {
        margin-top: auto;
        padding-top: 1.5rem;
        border-top: 1px solid var(--color-panel-border);
    }
    
    .mobile-user-info {
        margin-bottom: 1rem;
        text-align: center;
    }
    
    .user-email {
        color: var(--color-bright-accent);
        font-weight: 600;
        margin-top: 0.25rem;
        word-break: break-all;
    }
    
    .mobile-signout {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.8rem;
        background-color: transparent;
        color: var(--color-pale-green);
        border: 1px solid var(--color-muted-teal);
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .mobile-signout:hover {
        background-color: rgba(100, 255, 218, 0.05);
        transform: translateY(-2px);
        box-shadow: 0 4px 8px var(--color-shadow);
    }
    
    .auth-buttons {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .auth-buttons .login,
    .auth-buttons .signup {
        width: 100%;
        padding: 0.8rem;
        text-align: center;
        text-decoration: none;
        border-radius: 4px;
        font-size: 1rem;
        transition: all 0.2s ease;
        font-weight: 500;
    }
    
    .auth-buttons .login {
        color: var(--color-pale-green);
        border: 1px solid var(--color-muted-teal);
        background-color: transparent;
    }
    
    .auth-buttons .signup {
        background-color: var(--color-button-primary);
        color: var(--color-text);
        border: 1px solid var(--color-muted-teal);
    }
    
    .auth-buttons .login:hover,
    .auth-buttons .signup:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px var(--color-shadow);
    }
    
    :global(.icon-pale-green) {
        color: var(--color-pale-green);
        fill: var(--color-pale-green);
        stroke: var(--color-pale-green);
    }
</style>