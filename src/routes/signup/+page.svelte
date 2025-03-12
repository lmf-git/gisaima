<script>
    import { signUp } from '$lib/stores/auth';
    import { goto } from '$app/navigation';
    import Logo from '../../components/Logo.svelte';
    
    let email = '';
    let password = '';
    let confirmPassword = '';
    let error = null;
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        error = null;
        
        if (password !== confirmPassword) {
            error = "Passwords don't match";
            return;
        }
        
        const result = await signUp(email, password);
        
        if (result.success) {
            goto('/');
        } else {
            error = result.error;
        }
    };
</script>

<div class="signup-container">
    <Logo extraClass="logo" />
    <h1>Join Gisaima</h1>
    
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
                minlength="6"
            />
            <small class="help-text">Password must be at least 6 characters</small>
        </div>
        
        <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input 
                type="password" 
                id="confirmPassword" 
                bind:value={confirmPassword} 
                required
            />
        </div>
        
        <button type="submit" class="primary">Create Account</button>
    </form>
    
    <p class="login-link">Already have an account? <a href="/login">Login</a></p>
</div>

<style>
    .signup-container {
        max-width: 26em;
        width: 90%;
        margin: 3em auto;
        padding: 2em;
        background-color: var(--color-panel-bg);
        border: 1px solid var(--color-panel-border);
        border-radius: 0.5em;
        box-shadow: 0 0.3em 1em var(--color-shadow);
        color: var(--color-text);
        font-family: var(--font-body);
    }
    
    :global(.logo) {
        width: 5em;
        height: auto;
        margin: 0 auto 1em;
        display: block;
        filter: drop-shadow(0 0 0.5em rgba(193, 19, 22, 0.6));
    }
    
    h1 {
        margin-bottom: 1.5em;
        text-align: center;
        color: var(--color-pale-green);
        font-size: 1.8em;
        text-shadow: 0 0 0.3em rgba(0, 0, 0, 0.4);
    }
    
    .form-group {
        margin-bottom: 1.5em;
    }
    
    label {
        display: block;
        margin-bottom: 0.5em;
        font-weight: 600;
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
        font-family: var(--font-body);
    }
    
    button {
        width: 100%;
        padding: 0.75em;
        background-color: var(--color-button-primary);
        color: var(--color-text);
        border: 1px solid var(--color-muted-teal);
        border-radius: 0.25em;
        font-size: 1.1em;
        font-weight: bold;
        cursor: pointer;
        margin-top: 1em;
        transition: all 0.2s ease;
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
        font-weight: 600;
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
        .signup-container {
            width: 95%;
            padding: 1.5em;
            margin: 1.5em auto;
        }
        
        h1 {
            font-size: 1.5em;
        }
    }
</style>
