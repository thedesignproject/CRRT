export const activateCRRT = () => {
  window.dispatchEvent(new CustomEvent('crrt:activate'))
}
