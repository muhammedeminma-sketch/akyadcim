/* ==========================================================================
   DCIM Sunum — Giriş Sayfası (NewUICMPLoginComponent karşılığı)
   Gerçek kimlik doğrulama yoktur: kısa bir spinner sonrası 2d.html'e yönlendirir.
   ========================================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const form = $('login-form');
  const typeSelector = $('type-selector');
  const submitBtn = $('login-submit');
  const userInput = $('username');
  const passInput = $('password');
  const remember = $('remember-me');

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* yok say */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* yok say */ } },
    session(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* yok say */ } }
  };

  function showMessage(kind, text) {
    const err = $('login-error');
    const ok = $('login-success');
    err.classList.add('hidden');
    ok.classList.add('hidden');
    if (!kind) return;
    const el = kind === 'error' ? err : ok;
    el.querySelector('[data-msg]').textContent = text;
    el.classList.remove('hidden');
  }

  // Hatırlanan kullanıcı
  const remembered = store.get('dcim_remember_user');
  if (remembered) {
    try {
      userInput.value = JSON.parse(remembered).usr || '';
      remember.checked = true;
    } catch (e) { /* yok say */ }
  }

  // Şifre göster/gizle
  $('toggle-password').addEventListener('click', () => {
    const visible = passInput.type === 'text';
    passInput.type = visible ? 'password' : 'text';
    const icon = $('toggle-password').querySelector('i');
    icon.className = (visible ? 'pi pi-eye' : 'pi pi-eye-slash') + ' text-sm';
    $('toggle-password').title = visible ? 'Şifreyi Göster' : 'Şifreyi Gizle';
  });

  // Giriş tipi seçimi
  $('login-back').addEventListener('click', () => {
    showMessage(null);
    form.classList.add('hidden');
    typeSelector.classList.remove('hidden');
  });
  typeSelector.querySelectorAll('[data-login-type]').forEach(btn => btn.addEventListener('click', () => {
    typeSelector.classList.add('hidden');
    form.classList.remove('hidden');
    if (btn.getAttribute('data-login-type') === 'musteri') {
      showMessage('success', 'Müşteri portalı demo kapsamında kurum ekranlarına yönlendirilir.');
    }
    userInput.focus();
  }));

  $('forgot-password').addEventListener('click', () => {
    showMessage('success', 'Şifre sıfırlama bağlantısı kayıtlı e-posta adresinize gönderildi (demo).');
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const usr = userInput.value.trim();
    const pwd = passInput.value;
    if (!usr || !pwd) {
      showMessage('error', 'Lütfen kullanıcı adı ve şifre alanlarını doldurunuz.');
      return;
    }
    showMessage(null);
    submitBtn.disabled = true;
    submitBtn.querySelector('[data-icon]').className = 'pi pi-spin pi-spinner text-sm';

    const fullname = usr.toLowerCase() === 'operator' || usr.toLowerCase() === 'admin'
      ? 'DCIM Operatör'
      : usr.split(/[._\s-]+/).filter(Boolean).map(p => p.charAt(0).toLocaleUpperCase('tr-TR') + p.slice(1)).join(' ');
    const user = JSON.stringify({ usr, fullname });

    setTimeout(() => {
      store.session('dcim_user', user);
      if (remember.checked) store.set('dcim_remember_user', user);
      else store.remove('dcim_remember_user');
      showMessage('success', 'Giriş başarılı. Dijital İkiz ekranına yönlendiriliyorsunuz...');
      setTimeout(() => { window.location.href = '2d.html'; }, 450);
    }, 1100);
  });
})();
