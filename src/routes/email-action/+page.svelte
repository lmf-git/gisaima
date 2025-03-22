<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import { signInWithEmailLink } from '$lib/stores/user';
    
    // Use $state for the state object
    let state = $state({
        status: 'processing',  // processing, success, error, needs_email
        message: '',
        email: '',
        loading: false
    });
    
    // Check for email sign-in link when page loads
    onMount(async () => {
        if (browser) {
            const result = await signInWithEmailLink();
            
            if (result.success) {
                state.status = 'success';
                state.message = 'You have been successfully signed in!';
                
                // Redirect to home page after short delay
                setTimeout(() => {
                    goto('/');
                }, 2000);
            } 
            else if (result.needsEmail) {
                // User needs to provide email
                state.status = 'needs_email';
                state.message = result.error;
            }
            else if (result.notEmailLink) {
                // This isn't a sign-in link
                state.status = 'error';
                state.message = 'This page is meant for email sign-in links. Please use the link from your email.';
            }
            else {
                // Other error
                state.status = 'error';
                state.message = result.error || 'An error occurred during sign-in.';
            }
        }
    });
    
    // Handle email submission in case it wasn't found in storage
    async function handleEmailSubmit(e) {
        e.preventDefault();
        if (!state.email) return;
        
        state.loading = true;
        const result = await signInWithEmailLink(state.email);
        state.loading = false;
        
        if (result.success) {
            state.status = 'success';
            state.message = 'You have been successfully signed in!';
            
            setTimeout(() => {
                goto('/');
            }, 2000);
        } else {
            state.status = 'error';
            state.message = result.error || 'Failed to sign in with this email.';
        }
    }
</script>

<div class="email-action-page">
    <div class="email-action-container">
        <h1>Gisaima Email Sign-In</h1>
        
        {#if state.status === 'processing'}
            <div class="processing">
                <div class="spinner"></div>
                <p>Processing your sign-in...</p>
            </div>
        {:else if state.status === 'success'}
            <div class="success">
                <p>{state.message}</p>
                <p class="sub-message">Redirecting you to the home page...</p>
            </div>
        {:else if state.status === 'needs_email'}
            <div class="needs-email">
                <p>{state.message}</p>
                <form onsubmit={handleEmailSubmit}>
                    <div class="form-group">
                        <label for="email">Your Email</label>
                        <input 
                            type="email" 
                            id="email" 
                            bind:value={state.email} 
                            required
                            placeholder="Enter the email you used to sign up"
                            disabled={state.loading}
                        />
                    </div>
                    <button type="submit" class="primary" disabled={state.loading || !state.email}>
                        {state.loading ? 'Signing in...' : 'Continue Sign In'}
                    </button>
                </form>
            </div>
        {:else if state.status === 'error'}
            <div class="error">
                <p>{state.message}</p>
                <a href="/" class="home-link">Return to Home</a>
            </div>
        {/if}
    </div>
</div>

<style>
    .email-action-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 2em 0;
    }
    
    .email-action-container {
        max-width: 30em;
        width: 100%;
        padding: 2.5em;
        background-color: var(--color-panel-bg);
        border: 1px solid var(--color-panel-border);
        border-radius: 0.5em;
        box-shadow: 0 0.3em 1em var(--color-shadow);
        color: var(--color-text);
        margin: 0 1em;
        text-align: center;
    }
    
    h1 {
        margin-bottom: 1.5em;
        color: var(--color-pale-green);
        font-size: 1.8em;
        text-shadow: 0 0 0.3em rgba(0, 0, 0, 0.4);
        font-family: var(--font-heading);
        font-weight: 400;
    }
    
    .processing, .success, .error, .needs-email {
        margin-bottom: 1.5em;
    }
    
    .processing {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1em;
    }
    
    .spinner {
        display: inline-block;
        width: 3em;
        height: 3em;
        border: 0.3em solid rgba(100, 255, 218, 0.3);
        border-radius: 50%;
        border-top-color: var(--color-pale-green);
        animation: spin 1s ease-in-out infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .success {
        background-color: rgba(42, 199, 105, 0.1);
        color: var(--color-pale-green);
        padding: 1em;
        border-radius: 0.25em;
        border: 1px solid rgba(42, 199, 105, 0.4);
    }
    
    .error {
        background-color: rgba(198, 40, 40, 0.2);
        color: #ff5757;
        padding: 1em;
        border-radius: 0.25em;
        border: 1px solid rgba(198, 40, 40, 0.4);
    }
    
    .success p, .error p {
        margin: 0;
    }
    
    .sub-message {
        font-size: 0.9em;
        margin-top: 0.5em !important;
        opacity: 0.8;
    }
    
    .form-group {
        display: flex;
        flex-direction: column;
        margin-bottom: 1.5em;
        text-align: left;
    }
    
    label {
        display: block;
        margin-bottom: 0.5em;
        font-weight: 400;
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
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: var(--font-heading);
    }
    
    button:hover:not(:disabled) {
        background-color: var(--color-button-primary-hover);
        transform: translateY(-0.1em);
        box-shadow: 0 0.2em 0.5em var(--color-shadow);
    }
    
    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }
    
    .home-link {
        display: inline-block;
        margin-top: 1em;
        color: var(--color-pale-green);
        text-decoration: none;
        font-size: 1em;
    }
    
    .home-link:hover {
        text-decoration: underline;
    }
    
    @media (max-width: 480px) {
        .email-action-container {
            padding: 1.5em;
        }
        
        h1 {
            font-size: 1.5em;
        }
    }
</style>
