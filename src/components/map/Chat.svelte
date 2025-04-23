<script>
  import { onDestroy, onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { chatStore, messages, initializeChat, sendMessage, markAllAsRead, getMessageTime } from '../../lib/stores/chat.js';
  import { game } from '../../lib/stores/game.js';
  import { user } from '../../lib/stores/user.js';
  import Close from '../icons/Close.svelte';
  
  // Props using Svelte 5 runes syntax
  const { 
    closing = false, 
    onClose = () => {},
    onMouseEnter = () => {} // Add onMouseEnter prop
  } = $props();

  // We don't need internal isOpen state - the chat is already open if rendered
  let chatInput = $state('');
  
  // DOM References
  let chatContainer = $state(null);
  let messagesContainer = $state(null);
  
  // Constants
  const MAX_MESSAGE_LENGTH = 200;
  
  // Add this tracker to prevent infinite scrolling effect
  let lastScrolledMessageId = $state(null);
  
  // Cleanup function
  let cleanup = () => {};
  
  // Effect to initialize chat when world changes
  $effect(() => {
    if ($game.worldKey) {
      console.log(`Initializing chat for world: ${$game.worldKey}`);
      cleanup = initializeChat($game.worldKey);
    }
  });
  
  // Clean up subscription when component is destroyed
  onDestroy(() => {
    cleanup();
  });
  
  // Handle form submission
  function handleSubmit() {
    if (!chatInput.trim()) return;
    
    sendMessage(chatInput);
    chatInput = '';
  }
  
  function closeChat() {
    onClose();
  }

  // Add function to handle mouse enter
  function handleMouseEnter() {
    onMouseEnter();
  }
  
  // Modified effect to prevent infinite loops
  $effect(() => {
    if (!messagesContainer || $messages.length === 0) return;
    
    // Get the most recent message
    const latestMessage = $messages[$messages.length - 1];
    
    // Only scroll if we have a new message
    if (latestMessage && latestMessage.id !== lastScrolledMessageId) {
      // Update the tracker first
      lastScrolledMessageId = latestMessage.id;
      
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    }
  });
  
  // Separate effect just for marking messages as read
  $effect(() => {
    if ($messages.length > 0) {
      markAllAsRead();
    }
  });
  
  // Handle window resizing
  function handleResize() {
    if (chatContainer) {
      const windowHeight = window.innerHeight;
      const maxHeight = windowHeight * 0.5;  // Max 50% of viewport
      chatContainer.style.maxHeight = `${maxHeight}px`;
    }
  }
  
  onMount(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    
    // Focus the input field when opening
    setTimeout(() => {
      const inputElement = document.getElementById('chat-input');
      if (inputElement) {
        inputElement.focus();
      }
    }, 100);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });
  
  // Derived values
  const chatMessages = $derived($messages);
  const isLoading = $derived($chatStore.loading);
  const hasError = $derived($chatStore.error);
</script>

<div 
  class="chat-container"
  class:closing={closing}
  bind:this={chatContainer}
  onmouseenter={handleMouseEnter}
  transition:fade={{ duration: 200 }}
  role="region"
  aria-labelledby="chat-heading"
>
  <div class="chat-header">
    <h3 id="chat-heading">Chat</h3>
    <button class="close-button" onclick={closeChat} aria-label="Close chat">
      <Close extraClass="close-icon" />
    </button>
  </div>
  
  <div class="chat-messages" bind:this={messagesContainer}>
    {#if isLoading}
      <div class="chat-message system-message">
        <span class="message-text">Loading messages...</span>
      </div>
    {:else if hasError}
      <div class="chat-message system-message error">
        <span class="message-text">Error: {$chatStore.error}</span>
      </div>
    {:else if chatMessages.length === 0}
      <div class="chat-message system-message">
        <span class="message-text">No messages yet.</span>
      </div>
    {:else}
      {#each chatMessages as message (message.id)}
        <div 
          class="chat-message" 
          class:system-message={message.type === 'system'} 
          class:event-message={message.type === 'event'}
          class:player-message={message.type === 'user'}
        >
          {#if message.type === 'user'}
            <span class="message-user">{message.userName || 'Anonymous'}:</span>
          {/if}
          <span class="message-text">{message.text}</span>
          <span class="message-time">{getMessageTime(message.timestamp)}</span>
          
          {#if message.location}
            <button 
              class="location-button"
              onclick={() => {
                // Dispatch a custom event that can be listened for in the parent
                const event = new CustomEvent('goto-location', { 
                  detail: { x: message.location.x, y: message.location.y }
                });
                window.dispatchEvent(event);
              }}
            >
              @{message.location.x},{message.location.y}
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  
  <form class="chat-input-form" onsubmit={handleSubmit}>
    <input
      type="text"
      id="chat-input"
      bind:value={chatInput}
      maxlength={MAX_MESSAGE_LENGTH}
      placeholder="Type a message..."
      aria-label="Chat message"
    />
    <button type="submit" disabled={!chatInput.trim()}>Send</button>
  </form>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    background-color: rgba(255, 255, 255, 0.85);
    border-radius: 0.5rem;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    overflow: hidden;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    color: rgba(0, 0, 0, 0.8);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    width: min(400px, 90vw);
    max-height: 50vh;
  }
  
  .chat-container.closing {
    opacity: 0;
    transform: translateY(20px);
    pointer-events: none;
    transition: opacity 300ms ease, transform 300ms ease;
  }
  
  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
    flex-shrink: 0;
  }
  
  .chat-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(0, 0, 0, 0.6);
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .close-button:hover {
    color: rgba(0, 0, 0, 0.9);
  }
  
  .chat-messages {
    padding: 0.5rem;
    overflow-y: auto;
    flex: 1;
    max-height: 300px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .chat-input-form {
    display: flex;
    padding: 0.5rem;
    gap: 0.5rem;
    background-color: rgba(0, 0, 0, 0.05);
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    flex-shrink: 0;
  }
  
  .chat-input-form input {
    flex: 1;
    padding: 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(0, 0, 0, 0.2);
    background-color: rgba(255, 255, 255, 0.8);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .chat-input-form button {
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    border: none;
    background-color: #4a7dca;
    color: white;
    cursor: pointer;
  }
  
  .chat-input-form button:hover:not(:disabled) {
    background-color: #5a8dda;
  }
  
  .chat-input-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Messages styling */
  .chat-message {
    padding: 0.5rem;
    border-radius: 0.25rem;
    background-color: rgba(255, 255, 255, 0.5);
    word-break: break-word;
    position: relative;
    animation: fadeIn 0.2s ease;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .system-message {
    background-color: rgba(200, 200, 255, 0.5);
    font-style: italic;
    border: 1px solid rgba(100, 100, 255, 0.3);
  }
  
  .event-message {
    background-color: rgba(255, 200, 200, 0.5);
    border: 1px solid rgba(255, 100, 100, 0.3);
  }
  
  .player-message {
    background-color: rgba(200, 255, 200, 0.5);
    border: 1px solid rgba(100, 255, 100, 0.3);
  }
  
  .error {
    background-color: rgba(255, 200, 200, 0.5);
    border: 1px solid rgba(255, 100, 100, 0.3);
    color: #c62828;
  }
  
  .message-user {
    font-weight: bold;
    margin-right: 0.5rem;
    color: rgba(0, 0, 0, 0.85);
  }
  
  .message-text {
    display: inline;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .message-time {
    font-size: 0.75rem;
    color: rgba(0, 0, 0, 0.5);
    margin-left: 0.5rem;
    white-space: nowrap;
  }
  
  .location-button {
    background: rgba(0, 0, 0, 0.1);
    border: none;
    border-radius: 0.25rem;
    padding: 0.1rem 0.3rem;
    font-size: 0.8rem;
    cursor: pointer;
    margin-left: 0.3rem;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .location-button:hover {
    background: rgba(0, 0, 0, 0.2);
    color: rgba(0, 0, 0, 0.9);
  }
  
  :global(.close-icon) {
    width: 1.2rem;
    height: 1.2rem;
  }
  
  /* Responsive design */
  @media (max-width: 600px) {
    .chat-container {
      width: 85vw;
      max-height: 40vh;
    }
    
    .chat-messages {
      max-height: 200px;
    }
  }
</style>
