<script>
  import Showcase from '../components/specific/landing/Showcase.svelte';
  import Media from '../components/specific/landing/Media.svelte';
  import Features from '../components/specific/landing/Features.svelte';
  import Changes from '../components/specific/landing/Changes.svelte';
</script>

<svelte:head>
  <title>Gisaima - Strategic Territory Control MMO</title>
  <meta name="description" content="Explore infinite procedurally generated worlds in this strategic MMO. Discover rare terrain, build structures, command unit groups, and forge alliances in an ever-expanding universe." />
</svelte:head>

<div class="container">
  <!-- Showcase component -->
  <Showcase />
  
  <Media />
  <Features />
  <Changes />
</div>

<style>
  .container {
    color: var(--color-text);
  }
</style>