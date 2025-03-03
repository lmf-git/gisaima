<script>
    import { signUp } from '$lib/stores/authStore';
    import { goto } from '$app/navigation';
    
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
    <h1>Sign Up</h1>
    
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
        
        <button type="submit">Create Account</button>
    </form>
    
    <p>Already have an account? <a href="/login">Login</a></p>
</div>

<style>
    .signup-container {
        max-width: 400px;
        margin: 2rem auto;
        padding: 2rem;
        background-color: #f8f8f8;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    
    h1 {
        margin-bottom: 1.5rem;
        text-align: center;
        color: #333;
    }
    
    .form-group {
        margin-bottom: 1rem;
    }
    
    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: bold;
        color: #555;
    }
    
    input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }
    
    button {
        width: 100%;
        padding: 0.75rem;
        background-color: #3f51b5;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        margin-top: 1rem;
    }
    
    button:hover {
        background-color: #303f9f;
    }
    
    p {
        text-align: center;
        margin-top: 1rem;
    }
    
    a {
        color: #3f51b5;
        text-decoration: none;
    }
    
    a:hover {
        text-decoration: underline;
    }
    
    .error {
        background-color: #ffebee;
        color: #c62828;
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
    }
</style>
