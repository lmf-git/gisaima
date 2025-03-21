<script>
  import Showcase from '../components/Showcase.svelte';
  import Features from '../components/Features.svelte';
  import Media from '../components/Media.svelte';
</script>

<svelte:head>
  <title>Gisaima - Territory Strategy MMO</title>
  <meta name="description" content="An open source territory control strategy game with infinite procedurally generated worlds. No pay-to-win mechanics, based on ancient board games with modern twists." />
</svelte:head>

<div class="container">
  <Showcase />
  <Media />
  <Features />
</div>

<style>
  .container {
    color: var(--color-text);
  }

  /* Responsive styles */
  @media (min-width: 481px) {
    .container {

    }
  }

  @media (min-width: 769px) {
    .container {

    }
  }
</style>