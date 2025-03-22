<script>
  import { onMount } from 'svelte';
  import Close from './icons/Close.svelte';
  import { user, signUp } from '../lib/stores/user';
  
  const { onClose, animatingOut = false } = $props();
  
  // Form state
  let email = $state('');
  let password = $state('');
  let usePassword = $state(false);
  let isSubmitting = $state(false);
  let error = $state(null);
  let success = $state(false);
  let successMessage = $state('');
  
  // Handle form submission
  async function handleUpgrade(e) {
    e.preventDefault();
    error = null;
    isSubmitting = true;
    
    try {
      // Call user upgrade function
      const result = await signUp(email, usePassword ? password : null, true);
      
      if (result.success) {
        success = true;
        // Show different success message for passwordless vs password
        if (result.emailLink) {
          successMessage = `A sign-in link has been sent to ${email}. Please check your email to complete account upgrade.`;
        } else {
          successMessage = 'Account upgraded successfully! You can now log in using your email and password.';
        }
        setTimeout(() => {
          onClose?.();
        }, 3000);
      } else {
        error = result.error;
      }
    } catch (err) {
      error = err.message || 'An unexpected error occurred';
    } finally {
      isSubmitting = false;
    }
  }
  
  // Toggle password visibility
  function togglePassword() {
    usePassword = !usePassword;
    if (!usePassword) {
      password = '';
    }
  }
</script>

<!-- Add backdrop that covers the full screen -->
<div class={`warning-backdrop ${animatingOut ? 'animate-out' : 'animate-in'}`}>
</div>

<div class={`guest-warning ${animatingOut ? 'animate-out' : 'animate-in'}`}>
  <div class="warning-header">
    <h2>Temporary Account Notice</h2>
    <button class="close-btn" aria-label="Close dialog" onclick={onClose}>
      <Close size="2.2em" color="var(--color-text)" />
    </button>
  </div>
  
  <div class="warning-content">
    {#if success}
      <div class="success-message">
        <p>{successMessage}</p>
      </div>
    {:else}
      <div class="warning-message">
        <p>You're currently using a temporary guest account that will be deleted after 30 days of inactivity.</p>
        <p>To save your progress and create a permanent account, please provide your email address.</p>
      </div>
      
      {#if error}
        <div class="error-message">
          {error}
        </div>
      {/if}
      
      <form onsubmit={handleUpgrade} class="upgrade-form">
        <div class="form-group">
          <label for="email">Email Address</label>
          <input 
            type="email" 
            id="email" 
            bind:value={email}
            required
            placeholder="your.email@example.com"
            disabled={isSubmitting}
          />
        </div>
        
        <div class="password-option">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              bind:checked={usePassword}
              disabled={isSubmitting}
            />
            <span>Set a password (optional)</span>
          </label>
        </div>
        
        {#if usePassword}
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              bind:value={password}
              required={usePassword}
              placeholder="Minimum 6 characters"
              disabled={isSubmitting}
            />
          </div>
        {/if}
        
        <div class="form-actions">
          <button type="button" class="later-btn" onclick={onClose} disabled={isSubmitting}>
            Later
          </button>
          <button type="submit" class="upgrade-btn" disabled={isSubmitting || (usePassword && (!password || password.length < 6)) || !email}>
            {#if isSubmitting}
              <div class="spinner"></div>
              Upgrading...
            {:else}
              Upgrade Account
            {/if}
          </button>
        </div>
      </form>
      
      <p class="note">You can continue using the app as a guest for now and upgrade later.</p>
    {/if}
  </div>
</div>

<style>
  .warning-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(10, 25, 47, 0.85);
    z-index: 999;
    cursor: pointer;
  }
  
  .guest-warning {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 30em;
    background: rgba(21, 38, 60, 0.95);
    border: 2px solid var(--color-muted-teal);
    border-radius: 0.5em;
    box-shadow: 0 0.3em 1em rgba(0, 0, 0, 0.5);
    padding: 2em;
    z-index: 1000;
    color: var(--color-text);
    font-family: var(--font-body);
  }
  
  .warning-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5em;
    padding-bottom: 1em;
    border-bottom: 0.0625em solid var(--color-panel-border);
  }
  
  .warning-header h2 {
    color: var(--color-pale-green);
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 400;
    letter-spacing: 0.1em;
    font-size: 1.5em;
  }
  
  .close-btn {
    height: 3em;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    color: var(--color-text);
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.2s ease;
    padding: 0;
  }
  
  .close-btn:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.05);
  }
  
  .warning-content {
    display: flex;
    flex-direction: column;
    gap: 1.2em;
  }
  
  .warning-message p {
    margin: 0 0 0.8em 0;
    line-height: 1.5;
  }
  
  .success-message {
    text-align: center;
    background: rgba(42, 199, 105, 0.1);
    padding: 1em;
    border-radius: 0.5em;
    border: 1px solid rgba(42, 199, 105, 0.3);
  }
  
  .success-message p {
    margin: 0;
    color: var(--color-pale-green);
    font-weight: 600;
  }
  
  .error-message {
    background-color: rgba(198, 40, 40, 0.2);
    color: #ff5757;
    padding: 0.75em;
    border-radius: 0.25em;
    margin: 0.5em 0;
    border: 1px solid rgba(198, 40, 40, 0.4);
  }
  
  .upgrade-form {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }
  
  .form-group label {
    font-size: 0.9em;
    color: var (--color-muted-teal);
  }
  
  .form-group input {
    padding: 0.8em;
    background: rgba(0, 0, 0, 0.2);
    color: var(--color-text);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.25em;
    font-size: 1em;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  
  .form-group input:focus {
    outline: none;
    border-color: var(--color-muted-teal);
    box-shadow: 0 0 0 0.1em var(--color-muted-teal);
  }
  
  .password-option {
    display: flex;
    align-items: center;
    margin: 0.5em 0;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5em;
    cursor: pointer;
  }
  
  .checkbox-label input {
    margin: 0;
  }
  
  .form-actions {
    display: flex;
    justify-content: space-between;
    gap: 1em;
    margin-top: 0.5em;
  }
  
  .later-btn,
  .upgrade-btn {
    padding: 0.8em;
    border-radius: 0.25em;
    cursor: pointer;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1em;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }
  
  .later-btn {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-panel-border);
  }
  
  .upgrade-btn {
    background-color: var(--color-button-primary);
    color: var(--color-text);
    border: 1px solid var(--color-muted-teal);
  }
  
  .later-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .upgrade-btn:hover:not(:disabled) {
    background-color: var(--color-button-primary-hover);
    transform: translateY(-0.125em);
    box-shadow: 0 0.2em 0.5em var(--color-shadow);
  }
  
  .upgrade-btn:disabled,
  .later-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  
  .note {
    font-size: 0.85em;
    text-align: center;
    color: var(--color-text-secondary);
    margin-top: 0.5em;
  }
  
  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 0.2em solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s ease-in-out infinite;
    margin-right: 0.5em;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Animation classes */
  .animate-in {
    animation: fadeIn 0.3s ease forwards;
  }
  
  .animate-out {
    animation: fadeOut 0.3s ease forwards;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    .guest-warning {
      padding: 1.5em;
      width: 95%;
      max-height: 90vh;
      overflow-y: auto;
    }
    
    .warning-header h2 {
      font-size: 1.2em;
    }
  }
</style>
