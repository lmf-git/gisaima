<script>
  import { seedDatabase } from '../../lib/firebase/seed-database';
  import { user } from '../../lib/firebase/auth';
  
  let seeded = false;
  let error = null;
  
  async function handleSeedDatabase() {
    try {
      await seedDatabase();
      seeded = true;
    } catch (err) {
      error = err.message;
      console.error('Error seeding database:', err);
    }
  }
</script>

<div class="admin-page">
  <h1>Database Administration</h1>
  
  {#if $user}
    <div class="admin-panel">
      <h2>Seed Database</h2>
      <p>This will initialize the database with sample worlds and player data.</p>
      <p class="warning">Warning: This will overwrite existing data!</p>
      
      <button class="button danger" on:click={handleSeedDatabase} disabled={seeded}>
        {seeded ? 'Database Seeded!' : 'Seed Database'}
      </button>
      
      {#if error}
        <div class="error">
          <p>{error}</p>
        </div>
      {/if}
      
      {#if seeded}
        <div class="success">
          <p>Database successfully seeded!</p>
          <p>Created:</p>
          <ul>
            <li>2 worlds (Fantasy Realm, The Wasteland)</li>
            <li>Player entry for: YnVJdZxPpPYw55gbzTwYBRkY4xm2</li>
            <li>Player joined to Fantasy Realm</li>
            <li>Some initial structures in Fantasy Realm</li>
          </ul>
        </div>
      {/if}
    </div>
  {:else}
    <div class="unauthorized">
      <p>Please log in with an admin account to access this page.</p>
      <a href="/login" class="button">Login</a>
    </div>
  {/if}
</div>

<style>
  .admin-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .admin-panel {
    background: var(--color-card-bg);
    border: 1px solid var(--color-card-border);
    border-radius: 8px;
    padding: 1.5rem;
    margin-top: 2rem;
  }
  
  .warning {
    color: #ff6b6b;
    font-weight: bold;
    margin: 1rem 0;
  }
  
  .error {
    background: rgba(255, 107, 107, 0.2);
    border: 1px solid #ff6b6b;
    border-radius: 4px;
    padding: 1rem;
    margin-top: 1rem;
  }
  
  .success {
    background: rgba(80, 200, 120, 0.2);
    border: 1px solid #50c878;
    border-radius: 4px;
    padding: 1rem;
    margin-top: 1rem;
  }
  
  .unauthorized {
    text-align: center;
    margin-top: 3rem;
  }
  
  .button.danger {
    background-color: #ff6b6b;
    margin-top: 1rem;
  }
  
  .button.danger:hover:not([disabled]) {
    background-color: #ff4757;
  }
  
  .button[disabled] {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  ul {
    margin-left: 1.5rem;
  }
</style>
