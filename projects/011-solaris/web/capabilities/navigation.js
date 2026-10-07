// Keep keyboard focus visible when the scene list exceeds the header width.
const navigation = document.querySelector('header > nav[aria-label="场景导航"]');
navigation?.addEventListener('focusin', event => {
  const link = event.target.closest('a');
  if (link && navigation.contains(link)) {
    link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
});
