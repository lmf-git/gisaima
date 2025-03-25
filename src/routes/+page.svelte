<script>
  import Showcase from '../components/Showcase.svelte';
  import Features from '../components/Features.svelte';
  import Media from '../components/Media.svelte';
  // Keep these imports for use in other places if needed
  import { user } from '../lib/stores/user.js'; 
  import { game } from '../lib/stores/game.js';
  import { browser } from '$app/environment';
  
  // Remove the state variables and effect - Showcase will handle this directly
</script>

<svelte:head>
  <title>Gisaima - Territory Strategy MMO</title>
  <meta name="description" content="An open source territory control strategy game with infinite procedurally generated worlds. No pay-to-win mechanics, based on ancient board games with modern twists." />
</svelte:head>

<div class="container">
  <!-- Simplify the Showcase component - no need to pass props -->
  <Showcase />
  
  <Media />
  <Features />
</div>

<style>
  .container {
    color: var(--color-text);
  }
</style>