const form = document.getElementById('signup-form');
const emailInput = document.getElementById('email');
const messageEl = document.getElementById('form-message');
const submitBtn = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();

  setMessage('', '');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || 'Something went wrong.', 'error');
      return;
    }

    setMessage(data.message || 'Thanks for signing up!', 'success');
    form.reset();
  } catch (err) {
    setMessage('Network error. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

function setMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}
