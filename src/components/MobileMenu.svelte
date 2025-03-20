<script>
    import { user, signOut } from '$lib/stores/user';
    
    // Accept props directly without event dispatching
    let { menuOpen = false, onToggle, onClose } = $props();
</script>

<div class="mobile-menu">
    <button class="menu-toggle" onclick={onToggle} aria-label="Toggle menu">
        <span class="hamburger-icon" class:open={menuOpen}>
            <span></span>
            <span></span>
            <span></span>
        </span>
    </button>
    
    <div class="menu-overlay" class:is-open={menuOpen}></div>
    
    <div class="menu-content" class:is-open={menuOpen}>
        <div class="menu-header">
            <button class="close-button" onclick={onClose} aria-label="Close menu">
                <span class="close-icon">X</span>
            </button>
        </div>
        
        <nav class="menu-links">
            <a href="/map" class="menu-link" onclick={onClose}>Map</a>
            
            {#if !$user}
                <a href="/login" class="menu-link" onclick={onClose}>Login</a>
                <a href="/signup" class="menu-link" onclick={onClose}>Sign Up</a>
            {/if}
            
            {#if $user}
                <div class="menu-user-info">
                    <span class="greeting">Hello, {$user.email}</span>
                    <button class="button" onclick={() => { signOut(); onClose(); }}>Sign Out</button>
                </div>
            {/if}
        </nav>
    </div>
</div>

<style>
    .mobile-menu {
        display: block;
        position: relative;
        z-index: 1000;
    }

    .menu-toggle {
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.5rem;
        z-index: 1001;
        width: 3rem;
        height: 3rem;
    }

    .hamburger-icon {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        width: 2rem;
        height: 1.5rem;
        position: relative;
    }

    .hamburger-icon span {
        display: block;
        height: 0.2rem;
        width: 100%;
        background-color: var(--color-bright-accent);
        transition: all 0.3s ease;
        border-radius: 0.1rem;
    }

    .hamburger-icon.open span:nth-child(1) {
        transform: translateY(0.65rem) rotate(45deg);
    }

    .hamburger-icon.open span:nth-child(2) {
        opacity: 0;
    }

    .hamburger-icon.open span:nth-child(3) {
        transform: translateY(-0.65rem) rotate(-45deg);
    }

    .menu-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        display: none;
        z-index: 998;
    }

    .menu-overlay.is-open {
        display: block;
    }

    .menu-content {
        position: fixed;
        top: 0;
        right: -100%;
        width: 75%;
        max-width: 20rem;
        height: 100%;
        background-color: var(--color-dark-blue);
        box-shadow: -2px 0 5px var(--color-shadow);
        transition: right 0.3s ease;
        z-index: 999;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        border-left: 0.0625em solid var(--color-panel-border);
    }

    .menu-content.is-open {
        right: 0;
    }

    .menu-header {
        display: flex;
        justify-content: flex-end;
        padding: 0;
        border-bottom: 1px solid var(--color-panel-border);
    }

    .close-button {
        background: transparent;
        border: none;
        color: var(--color-bright-accent);
        cursor: pointer;
        transition: color 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 3rem;
        height: 3rem;
        padding: 0.5rem;
    }
    
    .close-icon {
        font-size: 1.5rem;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .close-button:hover {
        color: var(--color-text-primary);
    }

    .menu-links {
        display: flex;
        flex-direction: column;
        padding: 1rem;
    }

    .menu-link {
        color: var(--color-text-primary);
        font-size: 1.5rem;
        text-decoration: none;
        padding: 1rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.2s ease;
        font-family: var(--font-body);
    }

    .menu-link:hover {
        background-color: var(--color-button-hover);
        color: var(--color-bright-accent);
        transform: translateX(0.5rem);
    }

    .menu-user-info {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        margin-top: 1rem;
        border-top: 1px solid var(--color-panel-border);
    }

    .greeting {
        color: var(--color-heading);
        font-size: 1.1rem;
        font-family: var(--font-body);
    }
    
    .menu-user-info .button {
        background-color: var(--color-button-primary);
        border: none;
        color: var(--color-text);
        transition: all 0.2s ease;
        text-align: center;
    }
    
    .menu-user-info .button:hover {
        background-color: var(--color-button-primary-hover);
    }
</style>