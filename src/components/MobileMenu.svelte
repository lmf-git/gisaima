<script>
    import SignOut from './icons/SignOut.svelte';
    
    // Props
    const { onClose, currentPath, user, signOut, animatingOut = false } = $props();
</script>

<div class="mobile-menu">
    <div class={`mobile-menu-header ${animatingOut ? 'animate-out' : 'animate-item'}`}
         style={animatingOut ? 'animation-delay: 0.2s;' : ''}>
        <h2>Menu</h2>
    </div>
    
    <nav class="mobile-nav">
        {#if currentPath !== '/'}
            <a href="/" 
               class={animatingOut ? 'animate-out' : 'animate-item'} 
               class:active={currentPath === '/'}
               style={animatingOut ? 'animation-delay: 0.15s;' : ''}
            >Home</a>
        {/if}
        
        <!-- Only show worlds link if user is logged in -->
        {#if user && currentPath !== '/worlds'}
            <a href="/worlds" 
               class={animatingOut ? 'animate-out' : 'animate-item'} 
               class:active={currentPath === '/worlds'}
               style={animatingOut ? 'animation-delay: 0.1s;' : ''}
            >Worlds</a>
        {/if}
    </nav>
    
    <div class={`mobile-auth ${animatingOut ? 'animate-out' : 'animate-item'}`}
         style={animatingOut ? 'animation-delay: 0s;' : ''}>
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
    .mobile-menu {
        width: 90%; /* Changed from 100% to 90% to make it narrower */
        background-color: var(--color-dark-blue);
        border-top: 0.0625em solid var(--color-panel-border);
        border-bottom-left-radius: 0.5em; 
        border-bottom-right-radius: 0.5em; 
        box-shadow: 0 0.625em 1.875em rgba(0, 0, 0, 0.25);
        padding: 1.5em;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 60px);
        overflow-y: auto;
    }
    
    .mobile-menu-header {
        display: flex;
        justify-content: center; /* Changed from space-between to center */
        align-items: center;
        margin-bottom: 1.5em;
        padding-bottom: 1em;
        border-bottom: 0.0625em solid var(--color-panel-border);
    }
    
    .mobile-menu-header h2 {
        color: var(--color-bright-accent);
        margin: 0;
        font-family: var(--font-heading);
        font-weight: 400;
        letter-spacing: 0.1em;
    }
    
    .mobile-nav {
        display: flex;
        flex-direction: column;
        gap: 1em;
        margin-bottom: 2em;
    }
    
    .mobile-nav a {
        color: var(--color-text-secondary);
        text-decoration: none;
        font-size: 1.3em;
        padding: 0.8em 0.5em;
        border-radius: 0.25em;
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
        padding-top: 1.5em;
        border-top: 0.0625em solid var(--color-panel-border);
    }
    
    .mobile-user-info {
        margin-bottom: 1em;
        text-align: center;
    }
    
    .user-email {
        color: var(--color-bright-accent);
        font-weight: 600;
        margin-top: 0.25em;
        word-break: break-all;
    }
    
    .mobile-signout {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5em;
        padding: 0.8em;
        background-color: transparent;
        color: var(--color-pale-green);
        border: 0.0625em solid var(--color-muted-teal);
        border-radius: 0.25em;
        font-size: 1em;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .mobile-signout:hover {
        background-color: rgba(100, 255, 218, 0.05);
        transform: translateY(-0.125em);
        box-shadow: 0 0.25em 0.5em var(--color-shadow);
    }
    
    .auth-buttons {
        display: flex;
        flex-direction: column;
        gap: 1em;
    }
    
    .auth-buttons .login,
    .auth-buttons .signup {
        width: 100%;
        padding: 0.8em;
        text-align: center;
        text-decoration: none;
        border-radius: 0.25em;
        font-size: 1em;
        transition: all 0.2s ease;
        font-weight: 500;
        position: relative; /* Add position relative */
        margin-bottom: 0.125em; /* Add space for hover lift effect */
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
        transform: translateY(-0.125em);
        box-shadow: 0 0.25em 0.5em var(--color-shadow);
        /* No layout shift because we added margin-bottom */
    }
    
    :global(.icon-pale-green) {
        color: var(--color-pale-green);
        fill: var(--color-pale-green);
        stroke: var(--color-pale-green);
    }

    /* Animation for individual menu items */
    .animate-item {
        opacity: 0;
        transform: translateY(10px);
        animation: fadeIn 0.3s ease forwards;
    }
    
    .animate-out {
        opacity: 1;
        transform: translateY(0);
        animation: fadeOut 0.3s ease forwards;
    }
    
    .mobile-nav a.animate-item:nth-child(1) {
        animation-delay: 0.1s;
    }
    
    .mobile-nav a.animate-item:nth-child(2) {
        animation-delay: 0.15s;
    }
    
    .mobile-auth.animate-item {
        animation-delay: 0.2s;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(10px);
        }
    }
</style>