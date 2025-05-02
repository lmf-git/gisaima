<script>
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  
  import { messages, getMessageTime, initializeChat, markMessagesAsRead } from '../../../lib/stores/chat.js';
  import { game } from '../../../lib/stores/game.js';
  import { user } from '../../../lib/stores/user.js'; 

  // Props
  const { maxNotices = 5 } = $props();

  // State variables
  let activeNotices = $state([]);
  let nextId = $state(0);
  
  // Track processed message IDs to prevent duplicates
  let processedMessageIds = $state(new Set());
  // Track the last seen timestamp independently of active notices
  let lastSeenTimestamp = $state(Date.now());
  // Cleanup function for chat subscription
  let cleanup = $state(() => {});

  // Notice timeout duration in milliseconds
  const NOTICE_TIMEOUT = 6000;
  const NOTICE_FADE_DURATION = 300;

  // Setup chat subscription when component mounts
  $effect(() => {
    const worldKey = $game.worldKey;
    if (worldKey) {
      console.log(`Notices: Initializing chat subscription for world: ${worldKey}`);
      cleanup = initializeChat(worldKey);
    }
    
    // Cleanup on unmount
    return () => {
      console.log('Notices: Cleaning up chat subscription');
      cleanup();
    };
  });

  // Function to check if a message is relevant to the player
  function isRelevantToPlayer(message) {
    if (!$user || !$game?.player) return false;
    
    // Always show messages about the player's activities
    if (message.userId === $user.uid) return true;
    
    // Show messages about the player's groups
    const playerGroupIds = Object.keys($game.player?.groups || {});
    if (message.text && playerGroupIds.some(id => message.text.includes(id))) return true;
    
    // Show battle messages where player is involved
    if (message.type === 'event' && message.text && 
        (message.text.includes($game.player.displayName) || 
         message.text.includes('your') || 
         message.text.includes('You '))) return true;
    
    // Show player location related events
    if (message.location && $game.player.lastLocation &&
        message.location.x === $game.player.lastLocation.x && 
        message.location.y === $game.player.lastLocation.y) return true;
    
    return false;
  }

  // Process new messages and add as notices
  $effect(() => {
    if (!$messages || $messages.length === 0) return;

    // Get latest messages (newest last)
    const newMessages = [...$messages]
      .filter(isRelevantToPlayer)
      .filter(msg => {
        // Skip messages we've already processed by ID
        if (processedMessageIds.has(msg.id)) return false;
        
        // Skip messages older than our last seen timestamp
        if (msg.timestamp <= lastSeenTimestamp) return false;
        
        // Skip messages older than 60 seconds
        if (Date.now() - msg.timestamp > 60000) return false;
        
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (newMessages.length === 0) return;
    
    // Track message IDs to mark as read
    const messageIdsToMarkAsRead = [];
    
    // Process all new relevant messages
    for (const message of newMessages) {
      // Track that we've processed this message ID
      processedMessageIds.add(message.id);
      
      // Add to list of IDs to mark as read
      messageIdsToMarkAsRead.push(message.id);
      
      // Update last seen timestamp if needed
      if (message.timestamp > lastSeenTimestamp) {
        lastSeenTimestamp = message.timestamp;
      }
      
      // Add the notice
      addNotice({
        id: `notice-${nextId++}`,
        messageId: message.id, // Store the original message ID
        text: message.text,
        type: message.type,
        timestamp: message.timestamp,
        location: message.location
      });
    }
    
    // Mark all these messages as read since they appeared in notices
    if (messageIdsToMarkAsRead.length > 0) {
      console.log(`Notices: Marking ${messageIdsToMarkAsRead.length} messages as read`);
      markMessagesAsRead(messageIdsToMarkAsRead);
    }
    
    // Limit the size of the processed IDs set to prevent memory leaks
    if (processedMessageIds.size > 1000) {
      // Convert to array, slice to keep the most recent 500, then back to Set
      const idsArray = Array.from(processedMessageIds);
      processedMessageIds = new Set(idsArray.slice(-500));
    }
  });
  
  // Add a notice with auto-removal after timeout
  function addNotice(notice) {
    // Add new notice
    activeNotices = [...activeNotices, notice];
    
    // Limit to max notices by removing oldest
    if (activeNotices.length > maxNotices) {
      activeNotices = activeNotices.slice(-maxNotices);
    }
    
    // Schedule removal
    setTimeout(() => {
      removeNotice(notice.id);
    }, NOTICE_TIMEOUT);
  }
  
  // Remove a notice by ID
  function removeNotice(id) {
    activeNotices = activeNotices.filter(notice => notice.id !== id);
  }
  
  // Handle clicking on location coordinate in a notice
  function handleLocationClick(location) {
    if (!location) return;
    
    const event = new CustomEvent('goto-location', { 
      detail: { x: location.x, y: location.y }
    });
    window.dispatchEvent(event);
  }
</script>

<div class="notices-container" role="log" aria-live="polite">
  {#each activeNotices as notice (notice.id)}
    <div 
      class="notice"
      class:system-notice={notice.type === 'system'}
      class:event-notice={notice.type === 'event'}
      class:player-notice={notice.type === 'user'}
      animate:flip={{ duration: 300 }}
      in:fly={{ y: 20, duration: NOTICE_FADE_DURATION }}
      out:fade={{ duration: NOTICE_FADE_DURATION }}
    >
      <span class="notice-text">{notice.text}</span>
      
      {#if notice.location}
        <button 
          class="location-button"
          onclick={() => handleLocationClick(notice.location)}
        >
          @{notice.location.x},{notice.location.y}
        </button>
      {/if}
      
      <span class="notice-time">{getMessageTime(notice.timestamp)}</span>
    </div>
  {/each}
</div>

<style>
  .notices-container {
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    width: min(450px, 80vw);
    max-width: 80vw;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 1000;
    pointer-events: none;
  }
  
  .notice {
    background-color: rgba(255, 255, 255, 0.85);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    color: rgba(0, 0, 0, 0.8);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    pointer-events: auto;
    font-size: 0.9rem;
    word-break: break-word;
  }
  
  .system-notice {
    background-color: rgba(200, 200, 255, 0.7);
    border: 1px solid rgba(100, 100, 255, 0.3);
  }
  
  .event-notice {
    background-color: rgba(255, 220, 200, 0.7);
    border: 1px solid rgba(255, 150, 100, 0.3);
  }
  
  .player-notice {
    background-color: rgba(200, 255, 200, 0.7);
    border: 1px solid rgba(100, 255, 100, 0.3);
  }
  
  .notice-text {
    display: inline;
  }
  
  .notice-time {
    display: block;
    font-size: 0.75rem;
    color: rgba(0, 0, 0, 0.5);
    margin-top: 0.3rem;
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
  
  @media (max-width: 600px) {
    .notices-container {
      width: 90vw;
    }
    
    .notice {
      font-size: 0.8rem;
      padding: 0.5rem 0.75rem;
    }
  }
</style>
