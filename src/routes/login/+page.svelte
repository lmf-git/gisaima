<script>
    import { signIn, signInAnonymously } from '$lib/stores/user';
    import { goto } from '$app/navigation';
    import { user, loading as userLoading } from '$lib/stores/user';
    import { browser } from '$app/environment';
    
    // Convert variables to use $state
    let email = $state('');
    let password = $state('');
    let error = $state(null);
    let loading = $state(false);
    let googleLoading = $state(false);
    
    // Add effect to redirect authenticated users
    $effect(() => {
        if (browser && !$userLoading && $user) {
            // User is already authenticated, redirect to worlds page
            goto('/worlds');
        }
    });
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        error = null;
        loading = true;
        
        const result = await signIn(email, password);
        
        loading = false;
        if (result.success) {
            goto('/worlds');
        } else {
            error = result.error;
        }
    };
    
    const handleAnonymousLogin = async () => {
        error = null;
        loading = true;
        
        const result = await signInAnonymously();
        
        loading = false;
        if (result.success) {
            goto('/worlds');
        } else {
            error = result.error;
        }
    };

    const handleGoogleSignIn = async () => {
        googleLoading = true;
        error = null;
        
        // Your Google Auth implementation would go here
        // For now we're just improving the layout
        
        googleLoading = false;
    };
</script>

{#if $userLoading || $user === null}
    <div class="login-container">
        <h1>Login to Gisaima</h1>
        
        {#if error}
            <div class="error">{error}</div>
        {/if}
        
        <form onsubmit={handleSubmit}>
            <div class="form-group">
                <label for="email">Email</label>
                <input 
                    type="email" 
                    id="email" 
                    bind:value={email} 
                    required
                />
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input 
                    type="password" 
                    id="password" 
                    bind:value={password} 
                    required
                />
            </div>
            
            <button type="submit" class="primary" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
            </button>
        </form>
        
        <div class="separator">
            <span>or</span>
        </div>
        
        <div class="auth-alternatives">
            <button type="button" class="auth-provider" onclick={handleGoogleSignIn} disabled={googleLoading || loading}>
                <span class="provider-icon">G</span>
                {googleLoading ? 'Connecting...' : 'Continue with Google'}
            </button>
            
            <button type="button" class="secondary" onclick={handleAnonymousLogin} disabled={loading || googleLoading}>
                {loading ? 'Logging in...' : 'Continue as Guest'}
            </button>
        </div>
        
        <p class="signup-link">Don't have an account? <a href="/signup">Sign Up</a></p>
    </div>
{:else}
    <div class="redirecting-message">
        <p>You are already logged in. Redirecting...</p>
    </div>
{/if}

<style>
    .login-container {
        max-width: 26em;
        width: 100%;
        padding: 2.5em;
        background-color: var(--color-panel-bg);
        border: 1px solid var(--color-panel-border);
        border-radius: 0.5em;
        box-shadow: 0 0.3em 1em var(--color-shadow);
        color: var(--color-text);
        margin: 6em auto 2em; /* Add top margin to account for header */
    }
    
    h1 {
        margin-bottom: 1.5em;
        text-align: center;
        color: var(--color-pale-green);
        font-size: 1.8em;
        text-shadow: 0 0 0.3em rgba(0, 0, 0, 0.4);
        font-family: var(--font-heading); /* Added heading font */
        font-weight: 400; /* Reduced font weight */
    }
    
    .form-group {
        margin-bottom: 1.5em;
    }
    
    label {
        display: block;
        margin-bottom: 0.5em;
        font-weight: 400; /* Reduced from 600 to 400 */
        color: var(--color-muted-teal);
    }
    
    input {
        width: 100%;
        padding: 0.75em;
        background: rgba(0, 0, 0, 0.2);
        color: var(--color-text);
        border: 1px solid var(--color-panel-border);
        border-radius: 0.25em;
        font-size: 1em;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    
    input:focus {
        outline: none;
        border-color: var(--color-muted-teal);
        box-shadow: 0 0 0 0.1em var(--color-muted-teal);
    }
    
    button {
        width: 100%;
        padding: 0.75em;
        background-color: var(--color-button-primary);
        color: var(--color-text);
        border: 1px solid var(--color-muted-teal);
        border-radius: 0.25em;
        font-size: 1.1em;
        font-weight: 500; /* Reduced from bold/700 to 500 */
        cursor: pointer;
        margin-top: 1em;
        transition: all 0.2s ease;
        font-family: var(--font-heading);
    }
    
    button:hover {
        background-color: var(--color-button-primary-hover);
        transform: translateY(-0.1em);
        box-shadow: 0 0.2em 0.5em var(--color-shadow);
    }
    
    .signup-link {
        text-align: center;
        margin-top: 1.5em;
    }
    
    a {
        color: var(--color-pale-green);
        text-decoration: none;
        font-weight: 400; /* Reduced from 600 to 400 */
        transition: color 0.2s ease;
    }
    
    a:hover {
        text-decoration: underline;
        color: var(--color-muted-teal);
    }
    
    .error {
        background-color: rgba(198, 40, 40, 0.2);
        color: #ff5757;
        padding: 0.75em;
        border-radius: 0.25em;
        margin-bottom: 1.5em;
        border: 1px solid rgba(198, 40, 40, 0.4);
    }

    .redirecting-message {
        max-width: 26em;
        width: 100%;
        padding: 2.5em;
        text-align: center;
        color: var(--color-text);
        margin: 8em auto 0;
    }

    @media (max-width: 480px) {
        .login-container {
            width: calc(100% - 2em);
            padding: 1.25em;
            margin: 5em 1em 1em; /* Adjusted margin for mobile */
            box-sizing: border-box;
        }
        
        h1 {
            font-size: 1.5em;
            margin-bottom: 1em;
        }

        .form-group {
            margin-bottom: 1em;
        }

        button {
            padding: 0.6em;
            font-size: 1em;
        }

        .separator {
            margin: 1em 0;
        }

        .auth-alternatives {
            gap: 0.6em;
        }
        
        .auth-provider {
            font-size: 0.9em;
            padding: 0.6em;
        }
    }

    .separator {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 1.5em 0;
        width: 100%; /* Ensure full width */
    }
    
    .separator::before,
    .separator::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid var(--color-panel-border);
    }
    
    .separator span {
        padding: 0 0.75em;
        color: var(--color-text-secondary);
        font-size: 0.9em;
    }
    
    .auth-alternatives {
        display: flex;
        flex-direction: column;
        gap: 0.8em;
        width: 100%;
    }
    
    .auth-provider {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8em;
        background-color: transparent;
        border: 1px solid var(--color-panel-border);
        color: var(--color-text);
        padding: 0.75em;
        cursor: pointer;
        font-size: 1em;
        border-radius: 0.25em;
        transition: all 0.2s ease;
    }
    
    .auth-provider:hover:not(:disabled) {
        background-color: rgba(255, 255, 255, 0.05);
        transform: translateY(-0.1em);
    }
    
    .provider-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.2em;
        height: 1.2em;
        border-radius: 50%;
        background: #fff;
        color: #444;
        font-weight: 600;
        font-size: 1em;
    }
    
    button.secondary {
        background-color: transparent;
        border: 1px solid var(--color-muted-teal);
        color: var(--color-text);
    }
    
    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }
</style>
