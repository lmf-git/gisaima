<script>
    import { signUp, signInAnonymously } from '$lib/stores/user';
    import { goto } from '$app/navigation';
    
    // Convert all variables to use $state
    let email = $state('');
    let password = $state('');
    let confirmPassword = $state('');
    let passwordMode = $state(false);  // Default to passwordless sign-in
    let error = $state(null);
    let loading = $state(false);
    let success = $state(false);
    let successMessage = $state('');
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        error = null;
        
        if (passwordMode && password !== confirmPassword) {
            error = "Passwords don't match";
            return;
        }
        
        loading = true;
        const result = await signUp(email, passwordMode ? password : null);
        loading = false;
        
        if (result.success) {
            if (result.emailLink) {
                success = true;
                successMessage = `A sign-in link has been sent to ${email}. Please check your email to complete your registration.`;
            } else {
                goto('/worlds');
            }
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
    
    const togglePasswordMode = () => {
        passwordMode = !passwordMode;
        if (!passwordMode) {
            password = '';
            confirmPassword = '';
        }
    };
</script>

<div class="signup-page">
    <div class="signup-container">
        <h1>Join Gisaima</h1>
        
        {#if error}
            <div class="error">{ error }</div>
        {/if}
        
        {#if success}
            <div class="success">
                <p>{ successMessage }</p>
                <p class="sub-message">Check your inbox and spam folder for the sign-in link.</p>
            </div>
        {:else}
            <form onsubmit={handleSubmit}>
                <div class="form-group">
                    <label for="email">Email</label>
                    <input 
                        type="email" 
                        id="email" 
                        bind:value={email} 
                        required
                        placeholder="your.email@example.com"
                    />
                </div>
                
                <div class="auth-toggle">
                    <div class="toggle-buttons">
                        <button 
                            type="button"
                            class="toggle-button" 
                            class:active={!passwordMode}
                            onclick={() => togglePasswordMode()}
                            disabled={loading}
                        >
                            Passwordless
                        </button>
                        <button 
                            type="button"
                            class="toggle-button" 
                            class:active={passwordMode}
                            onclick={() => togglePasswordMode()}
                            disabled={loading}
                        >
                            With Password
                        </button>
                    </div>
                    <small class="help-text">
                        {passwordMode
                            ? 'You will sign in with email and password.'
                            : 'You will receive a secure login link via email when signing in.'}
                    </small>
                </div>
                
                {#if passwordMode}
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input 
                            type="password" 
                            id="password" 
                            bind:value={password} 
                            required={passwordMode}
                            minlength="6"
                            placeholder="Minimum 6 characters"
                        />
                    </div>
                    
                    <div class="form-group">
                        <label for="confirmPassword">Confirm Password</label>
                        <input 
                            type="password" 
                            id="confirmPassword" 
                            bind:value={confirmPassword} 
                            required={passwordMode}
                            placeholder="Re-enter your password"
                        />
                    </div>
                {/if}
                
                <button type="submit" class="primary" disabled={loading || !email || (passwordMode && (!password || password.length < 6 || password !== confirmPassword))}>
                    {loading ? 'Creating Account...' : 'Create Account'}
                </button>
            </form>
            
            <div class="separator">
                <span>or</span>
            </div>
            
            <button type="button" class="secondary" onclick={handleAnonymousLogin} disabled={loading}>
                {loading ? 'Logging in...' : 'Continue as Guest'}
            </button>
        {/if}
        
        <p class="login-link">Already have an account? <a href="/login">Login</a></p>
    </div>
</div>

<style>
    .signup-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 2em 0;
    }
    
    .signup-container {
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
    
    .help-text {
        display: block;
        margin-top: 0.5em;
        color: var(--color-text-secondary);
        font-size: 0.85em;
        font-weight: 300; /* Added light font weight */
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
    
    .login-link {
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
        .signup-page {
            padding: 1em 0;
            align-items: flex-start;
        }
        
        .signup-container {
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

        .help-text {
            font-size: 0.8em;
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

    .auth-toggle {
        margin-bottom: 1.5em;
    }
    
    .toggle-buttons {
        display: flex;
        border: 1px solid var(--color-panel-border);
        border-radius: 0.25em;
        overflow: hidden;
        margin-bottom: 0.5em;
    }
    
    .toggle-button {
        flex: 1;
        padding: 0.5em;
        background: none;
        border: none;
        border-right: 1px solid var(--color-panel-border);
        color: var(--color-text-secondary);
        font-size: 0.9em;
        margin: 0;
        transition: all 0.2s ease;
        cursor: pointer;
    }
    
    .toggle-button:last-child {
        border-right: none;
    }
    
    .toggle-button.active {
        background-color: rgba(100, 255, 218, 0.1);
        color: var(--color-pale-green);
        font-weight: 500;
    }
    
    .toggle-button:hover:not(.active):not(:disabled) {
        background-color: rgba(255, 255, 255, 0.05);
    }
    
    .success {
        background-color: rgba(42, 199, 105, 0.1);
        color: var(--color-pale-green);
        padding: 1em;
        border-radius: 0.25em;
        margin-bottom: 1.5em;
        border: 1px solid rgba(42, 199, 105, 0.4);
        text-align: center;
    }
    
    .success p {
        margin: 0;
    }
    
    .success .sub-message {
        font-size: 0.9em;
        margin-top: 0.5em;
        opacity: 0.8;
    }
    
</style>
