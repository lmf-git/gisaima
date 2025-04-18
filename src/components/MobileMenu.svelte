<script>
    import SignOut from './icons/SignOut.svelte';
    
    // Props - add class property
    const { onClose, currentPath, user, signOut, animatingOut = false, class: className = '' } = $props();
</script>

<!-- Add backdrop that covers the full screen -->
<div class={`menu-backdrop ${animatingOut ? 'animate-out' : 'animate-in'}`} >
</div>

<div class={`mobile-menu ${className}`}>
    <div class={`mobile-menu-header ${animatingOut ? 'animate-out' : 'animate-item'}`}
         style={animatingOut ? 'animation-delay: 0.2s;' : ''}>
        <h2>Menu</h2>
    </div>
    
    <nav class="mobile-nav">
        {#if currentPath !== '/'}
            <a href="/" 
               onclick={onClose}
               class={animatingOut ? 'animate-out' : 'animate-item'} 
               class:active={currentPath === '/'}
               style={animatingOut ? 'animation-delay: 0.15s;' : ''}
            >Home</a>
        {/if}
        
        {#if currentPath !== '/guide'}
            <a href="/guide" 
               onclick={onClose}
               class={animatingOut ? 'animate-out' : 'animate-item'} 
               class:active={currentPath === '/guide'}
               style={animatingOut ? 'animation-delay: 0.125s;' : ''}
            >Guide</a>
        {/if}
        
        <!-- Only show worlds link if user is logged in -->
        {#if user && currentPath !== '/worlds'}
            <a href="/worlds" 
               onclick={onClose}
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
                <p class="user-email">{user.isAnonymous ? 'Guest' : (user.displayName || user.email)}</p>
            </div>
            <button class="mobile-signout" onclick={signOut}>
                <SignOut size="1.2em" extraClass="icon-pale-green" />
                <span>Sign Out</span>
            </button>
        {:else}
            <div class="auth-buttons">
                <a href="/login" onclick={onClose} class="login">Log In</a>
                <a href="/signup" onclick={onClose} class="signup">Sign Up</a>
            </div>
        {/if}
    </div>
</div>

<style>
    .mobile-menu {
        position: absolute; /* Position absolutely */
        top: 100%; /* Position below header */
        left: 1rem; /* Spacing from left edge */
        right: 1rem; /* Spacing from right edge */
        max-width: 500px; /* Limit the maximum width */
        margin: 0 auto; /* Center the menu */
        box-sizing: border-box; /* Include padding in width */
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
        z-index: 100; /* Ensure proper z-index */
    }
    
    .mobile-menu-header {
        display: flex;
        justify-content: center;
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
        font-family: var(--font-body); /* Add body font */
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
        font-family: var(--font-body); /* Add body font */
    }
    
    .user-email {
        color: var(--color-bright-accent);
        font-weight: 600;
        margin-top: 0.25em;
        word-break: break-all;
        font-family: var(--font-heading); /* Add heading font for emphasis */
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
        font-family: var(--font-heading); /* Add heading font for buttons */
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

    :global(.mobile-signout) > :global(.icon-pale-green) {
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

    /* Add backdrop styling */
    .menu-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(10, 25, 47, 0.85); /* Dark navy with transparency */
        z-index: 99; /* Below menu but above other content */
        cursor: pointer;
    }
    
    /* Animation for backdrop */
    .menu-backdrop.animate-in {
        opacity: 0;
        animation: backdropFadeIn 0.3s ease forwards;
    }
    
    .menu-backdrop.animate-out {
        opacity: 1;
        animation: backdropFadeOut 0.3s ease forwards;
    }
    
    @keyframes backdropFadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    @keyframes backdropFadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }
</style>