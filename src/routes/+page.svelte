<script>
  import Showcase from '../components/Showcase.svelte';
  import Features from '../components/Features.svelte';
  import Media from '../components/Media.svelte';
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
</div>

<style>
  .container {
    color: var(--color-text);
  }
</style>