const directory = document.querySelector('#scene-directory');
let opener;

for (const button of document.querySelectorAll('[data-open-scene-directory]')) {
  button.addEventListener('click', () => {
    opener = button;
    if (!directory.open) directory.showModal();
  });
}

directory.addEventListener('close', () => opener?.focus());
directory.addEventListener('click', event => {
  if (event.target !== directory) return;
  const rect = directory.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) directory.close();
});
