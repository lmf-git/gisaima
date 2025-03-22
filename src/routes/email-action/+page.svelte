<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { handleEmailLink } from '$lib/stores/user';
  import { browser } from '$app/environment';
  
  let processing = $state(true);
  let error = $state(null);
  let email = $state('');
  
  onMount(async () => {
    if (browser) {
      try {
        processing = true;
        const result = await handleEmailLink();
        
        if (result.success) {
          // Redirect to worlds page instead of home page
          goto('/worlds');
        } else if (result.needsEmail) {
          processing = false;
          error = result.error;
        } else if (result.notEmailLink) {
          // Not an email sign-in link, redirect to home
          goto('/');
        } else {
          processing = false;
          error = result.error || 'Failed to sign in. Please try again.';
        }
      } catch (err) {
        processing = false;
        error = err.message || 'An unexpected error occurred';
        console.error('Error handling email link:', err);
      }
    }
  });
  
  async function handleSubmitEmail() {
    if (!email) {
      error = 'Please enter your email address';
      return;
    }
    
    try {
      processing = true;
      const result = await handleEmailLink(email);
      
      if (result.success) {
        // Redirect to worlds page instead of home page
        goto('/worlds');
      } else {
        processing = false;
        error = result.error || 'Failed to sign in. Please try again.';
      }
    } catch (err) {
      processing = false;
      error = err.message || 'An unexpected error occurred';
    }
  }
</script>

<div class="email-action-page">
  <div class="email-action-container">
    <h1>Email Sign In</h1>
    
    {#if processing}
      <div class="processing">
        <div class="spinner"></div>
        <p>Processing your sign-in link...</p>
      </div>
    {:else if error}
      <div class="error-container">
        <p class="error">{error}</p>
        
        {#if error.includes('Email not found')}
          <div class="email-form">
            <p>Please enter the email you used to request the sign-in link:</p>
            <div class="form-group">
              <input 
                type="email" 
                placeholder="Your email address" 
                bind:value={email} 
              />
            </div>
            <button onclick={handleSubmitEmail}>Continue</button>
          </div>
        {/if}
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
    max-width: 26em;
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
  
  .processing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;
  }
  
  .spinner {
    width: 3em;
    height: 3em;
    border: 0.25em solid rgba(100, 255, 218, 0.2);
    border-radius: 50%;
    border-top: 0.25em solid var(--color-pale-green);
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .error {
    color: #ff5757;
    background-color: rgba(198, 40, 40, 0.2);
    padding: 0.75em;
    border-radius: 0.25em;
    margin-bottom: 1.5em;
    border: 1px solid rgba(198, 40, 40, 0.4);
  }
  
  .email-form {
    margin-top: 1.5em;
  }
  
  .form-group {
    margin-bottom: 1.5em;
  }
  
  input {
    width: 100%;
    padding: 0.75em;
    background: rgba(0, 0, 0, 0.2);
    color: var(--color-text);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.25em;
    font-size: 1em;
    margin-top: 0.5em;
  }
  
  button {
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
    width: 100%;
  }
  
  button:hover {
    background-color: var(--color-button-primary-hover);
    transform: translateY(-0.1em);
    box-shadow: 0 0.2em 0.5em var(--color-shadow);
  }
</style>
