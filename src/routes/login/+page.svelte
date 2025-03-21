<script>
    import { signIn, signInAnonymously } from '$lib/stores/user';
    import { goto } from '$app/navigation';
    
    let email = '';
    let password = '';
    let error = null;
    let loading = false;
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        error = null;
        loading = true;
        
        const result = await signIn(email, password);
        
        loading = false;
        if (result.success) {
            goto('/');
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
            goto('/');
        } else {
            error = result.error;
        }
    };
</script>

<div class="login-page">
    <div class="login-container">
        <h1>Login to Gisaima</h1>
        
        {#if error}
            <div class="error">{error}</div>
        {/if}
        
        <form on:submit={handleSubmit}>
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
        
        <button class="secondary" on:click={handleAnonymousLogin} disabled={loading}>
            {loading ? 'Logging in...' : 'Continue as Guest'}
        </button>
        
        <p class="signup-link">Don't have an account? <a href="/signup">Sign Up</a></p>
    </div>
</div>

<style>
    .login-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 2em 0;
    }

    .login-container {
        max-width: 26em;
        width: 100%;
        padding: 2.5em;
        background-color: var(--color-panel-bg);
        border: 1px solid var(--color-panel-border);
        border-radius: 0.5em;
        box-shadow: 0 0.3em 1em var(--color-shadow);
        color: var(--color-text);
        margin: 0 1em; /* Added horizontal margin instead of padding */
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

    @media (max-width: 480px) {
        .login-page {
            padding: 1em 0;
            align-items: flex-start;
        }
        
        .login-container {
            width: 100%;
            padding: 1.25em;
            margin: 0 0.5em; /* Reduced margin on smaller screens */
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
    }

    .separator {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 1.5em 0;
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
    
    button.secondary {
        background-color: transparent;
        border: 1px solid var(--color-muted-teal);
        color: var(--color-text);
        margin-top: 0;
    }
    
    button.secondary:hover {
        background-color: rgba(255, 255, 255, 0.05);
    }
    
    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }
</style>
