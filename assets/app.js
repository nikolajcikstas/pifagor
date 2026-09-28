/* Анкета кандидата — онлайн-школа «Пифагор» */
(function () {
  "use strict";

  // ===== НАСТРОЙКИ ОТПРАВКИ =====
  var CONFIG = {
    vacancy: "Менеджер по контролю качества",
    // 1) Письмо на почту школы через FormSubmit (без регистрации;
    //    при первой заявке на почту придёт письмо «Activate form» — нажмите кнопку один раз).
    emailEndpoint: "https://formsubmit.co/ajax/pifagor.by@gmail.com",
    // 2) Заявка в CRM личного кабинета (раздел «Заявки с сайта»).
    //    Сработает, когда домен GitHub Pages добавлен в CORS бэкенда.
    crmEndpoint: "https://backend-pifagor.onrender.com/api/v1/requests",
    fallbackEmail: "pifagor.by@gmail.com"
  };
  // ==============================

  var form = document.getElementById("vacancyForm");
  if (!form) return;
  if (form.getAttribute("data-vacancy")) CONFIG.vacancy = form.getAttribute("data-vacancy");

  var steps = Array.prototype.slice.call(form.querySelectorAll(".step"));
  var btnNext = document.getElementById("btnNext");
  var btnBack = document.getElementById("btnBack");
  var btnSubmit = document.getElementById("btnSubmit");
  var stepCounter = document.getElementById("stepCounter");
  var stepTitle = document.getElementById("stepTitle");
  var ringFg = form.querySelector(".progress-ring .fg");
  var errorBox = document.getElementById("formError");
  var success = document.getElementById("formSuccess");
  var current = 0;
  var CIRC = 150.8;
  var DRAFT_KEY = "pifagor-vacancy-qc-draft";

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- phone mask +375 (XX) XXX-XX-XX ----------
  var phone = form.elements.phone;
  function phoneDigits(v) {
    var s = String(v || "");
    if (s.indexOf("+375") === 0) s = s.slice(4); // уже подставленный префикс
    var d = s.replace(/\D/g, "");
    // код страны или «80», введённые вручную/автозаполнением
    if (d.indexOf("375") === 0) d = d.slice(3);
    else if (d.indexOf("80") === 0) d = d.slice(2);
    return d.slice(0, 9);
  }
  function formatPhone(v) {
    var d = phoneDigits(v);
    var out = "+375";
    if (d.length) out += " (" + d.slice(0, 2);
    if (d.length >= 2) out += ")";
    if (d.length > 2) out += " " + d.slice(2, 5);
    if (d.length > 5) out += "-" + d.slice(5, 7);
    if (d.length > 7) out += "-" + d.slice(7, 9);
    return out;
  }
  phone.addEventListener("focus", function () { if (!phone.value) phone.value = "+375 "; });
  phone.addEventListener("blur", function () { if (phoneDigits(phone.value).length === 0) phone.value = ""; });
  phone.addEventListener("input", function () {
    var atEnd = phone.selectionStart === phone.value.length;
    phone.value = formatPhone(phone.value);
    if (atEnd) phone.setSelectionRange(phone.value.length, phone.value.length);
  });

  // telegram: always start with @
  var tg = form.elements.telegram;
  tg.addEventListener("blur", function () {
    var v = tg.value.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@+/, "");
    tg.value = v ? "@" + v : "";
  });

  // ---------- validation ----------
  var validators = {
    name: function (v) { return v.trim().length >= 2; },
    surname: function (v) { return v.trim().length >= 2; },
    age: function (v) { var n = Number(v); return n >= 16 && n <= 70; },
    city: function (v) { return v.trim().length >= 2; },
    phone: function (v) { return phoneDigits(v).length === 9; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
    telegram: function (v) { return /^@?[A-Za-z0-9_]{4,32}$/.test(v.trim()); },
    hours: function (v) { return !!v; },
    start: function (v) { return !!v; }
  };
  var groupValidators = {
    status: function () { return !!form.querySelector('input[name="status"]:checked'); },
    slots: function () { return !!form.querySelector('input[name="slots"]:checked'); },
    experience: function () { return !!form.querySelector('input[name="experience"]:checked'); },
    consent: function () { return form.elements.consent.checked; }
  };

  function setError(fieldEl, bad) { if (fieldEl) fieldEl.classList.toggle("has-error", bad); }

  function validateStep(idx) {
    var ok = true, firstBad = null;
    var stepEl = steps[idx];
    stepEl.querySelectorAll("input, select, textarea").forEach(function (el) {
      var fn = validators[el.name];
      if (!fn) return;
      var bad = !fn(el.value);
      setError(el.closest(".field"), bad);
      if (bad) { ok = false; firstBad = firstBad || el; }
    });
    stepEl.querySelectorAll("[data-group]").forEach(function (g) {
      var bad = !groupValidators[g.getAttribute("data-group")]();
      setError(g, bad);
      if (bad) { ok = false; firstBad = firstBad || g.querySelector("input"); }
    });
    if (firstBad) firstBad.focus({ preventScroll: false });
    return ok;
  }

  // clear error on edit
  form.addEventListener("input", function (e) {
    var f = e.target.closest(".field");
    if (f && f.classList.contains("has-error")) {
      var fn = validators[e.target.name];
      var g = f.getAttribute("data-group");
      if ((fn && fn(e.target.value)) || (g && groupValidators[g]())) f.classList.remove("has-error");
    }
    saveDraft();
  });
  form.addEventListener("change", function (e) {
    var f = e.target.closest("[data-group]");
    if (f && groupValidators[f.getAttribute("data-group")]()) f.classList.remove("has-error");
    saveDraft();
  });

  // ---------- steps ----------
  function showStep(idx, focus) {
    current = idx;
    steps.forEach(function (s, i) { s.classList.toggle("is-active", i === idx); });
    var s = steps[idx];
    stepCounter.textContent = (idx + 1) + "/" + steps.length;
    stepTitle.innerHTML = s.getAttribute("data-title") + "<small>" + s.getAttribute("data-hint") + "</small>";
    ringFg.style.strokeDashoffset = String(CIRC * (1 - (idx + 1) / steps.length));
    btnBack.hidden = idx === 0;
    btnNext.hidden = idx === steps.length - 1;
    btnSubmit.hidden = idx !== steps.length - 1;
    hideError();
    if (focus) {
      var card = form.closest(".form-card");
      var top = card.getBoundingClientRect().top + window.pageYOffset - 84;
      if (card.getBoundingClientRect().top < 60) window.scrollTo({ top: top, behavior: "smooth" });
      var first = s.querySelector("input:not([type=hidden]), select, textarea");
      if (first && window.matchMedia("(min-width: 700px)").matches) setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
    }
  }
  btnNext.addEventListener("click", function () {
    if (validateStep(current)) showStep(current + 1, true);
  });
  btnBack.addEventListener("click", function () { showStep(current - 1, true); });
  form.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && current < steps.length - 1) {
      e.preventDefault(); btnNext.click();
    }
  });

  // ---------- draft (per-browser convenience) ----------
  function collect() {
    var fd = new FormData(form);
    return {
      name: (fd.get("name") || "").trim(),
      surname: (fd.get("surname") || "").trim(),
      patronymic: (fd.get("patronymic") || "").trim(),
      age: (fd.get("age") || "").trim(),
      city: (fd.get("city") || "").trim(),
      phone: fd.get("phone") || "",
      email: (fd.get("email") || "").trim(),
      telegram: (fd.get("telegram") || "").trim(),
      contact_pref: fd.get("contact_pref") || "",
      status: fd.get("status") || "",
      place: (fd.get("place") || "").trim(),
      hours: fd.get("hours") || "",
      start: fd.get("start") || "",
      slots: fd.getAll("slots"),
      experience: fd.get("experience") || "",
      about: (fd.get("about") || "").trim(),
      source: fd.get("source") || ""
    };
  }
  var draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(collect())); } catch (e) {}
    }, 300);
  }
  function restoreDraft() {
    var d;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { d = null; }
    if (!d) return;
    Object.keys(d).forEach(function (k) {
      var v = d[k];
      var els = form.querySelectorAll('[name="' + k + '"]');
      if (!els.length) return;
      els.forEach(function (el) {
        if (el.type === "radio") el.checked = el.value === v;
        else if (el.type === "checkbox") el.checked = Array.isArray(v) && v.indexOf(el.value) !== -1;
        else if (v) el.value = v;
      });
    });
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  restoreDraft();

  // ---------- submit ----------
  function getUtm() {
    var p = new URLSearchParams(location.search);
    return ["utm_source", "utm_medium", "utm_campaign"].map(function (k) { return p.get(k) ? k + "=" + p.get(k) : ""; }).filter(Boolean).join(", ");
  }
  function fullName(d) { return [d.surname, d.name, d.patronymic].filter(Boolean).join(" "); }
  function normPhone(v) { return "+375" + phoneDigits(v); }

  function summaryLines(d) {
    return [
      "Вакансия: " + CONFIG.vacancy,
      "ФИО: " + fullName(d),
      "Возраст: " + d.age + ", город: " + d.city,
      "Телефон: " + formatPhone(d.phone),
      "E-mail: " + d.email,
      "Telegram: " + d.telegram,
      "Удобная связь: " + d.contact_pref,
      "Занятость: " + d.status + (d.place ? " (" + d.place + ")" : ""),
      "Часов в день: " + d.hours,
      "Время: " + d.slots.join(", "),
      "Готов(а) начать: " + d.start,
      "Опыт с клиентами: " + d.experience,
      d.about ? "О себе: " + d.about : "",
      d.source ? "Источник: " + d.source : "",
      getUtm() ? "UTM: " + getUtm() : ""
    ].filter(Boolean);
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function sendEmail(d) {
    if (!CONFIG.emailEndpoint) return Promise.reject(new Error("no email endpoint"));
    var payload = {
      _subject: "Отклик на вакансию: " + CONFIG.vacancy + " — " + fullName(d),
      _template: "table",
      _replyto: d.email,
      "Вакансия": CONFIG.vacancy,
      "ФИО": fullName(d),
      "Возраст": d.age,
      "Город": d.city,
      "Телефон": formatPhone(d.phone),
      "E-mail": d.email,
      "Telegram": d.telegram,
      "Удобная связь": d.contact_pref,
      "Занятость": d.status,
      "Место учёбы/работы": d.place || "—",
      "Часов в день": d.hours,
      "Удобное время": d.slots.join(", "),
      "Готов(а) начать": d.start,
      "Опыт работы с клиентами": d.experience,
      "Почему интересна работа": d.about || "—",
      "Откуда узнал(а)": d.source || "—",
      "UTM": getUtm() || "—",
      "Отправлено": new Date().toLocaleString("ru-RU", { timeZone: "Europe/Minsk" })
    };
    return withTimeout(fetch(CONFIG.emailEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    }), 20000).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "email failed");
        return "email";
      });
    });
  }

  function sendCrm(d) {
    if (!CONFIG.crmEndpoint) return Promise.reject(new Error("no crm endpoint"));
    return withTimeout(fetch(CONFIG.crmEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fullName(d),
        phone: normPhone(d.phone),
        message: summaryLines(d).filter(function (l) { return l.indexOf("ФИО:") !== 0 && l.indexOf("Телефон:") !== 0; }).join("\n")
      })
    }), 25000).then(function (r) {
      if (!r.ok) throw new Error("crm " + r.status);
      return "crm";
    });
  }

  function anySuccess(promises) {
    return new Promise(function (resolve, reject) {
      var left = promises.length, errs = [];
      promises.forEach(function (p) {
        p.then(resolve, function (e) { errs.push(e); if (--left === 0) reject(errs); });
      });
    });
  }

  function showError(html) { errorBox.innerHTML = html; errorBox.classList.add("is-visible"); }
  function hideError() { errorBox.classList.remove("is-visible"); errorBox.innerHTML = ""; }

  function mailtoLink(d) {
    return "mailto:" + CONFIG.fallbackEmail +
      "?subject=" + encodeURIComponent("Отклик на вакансию: " + CONFIG.vacancy) +
      "&body=" + encodeURIComponent(summaryLines(d).join("\n"));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validateStep(current)) return;
    if (form.elements._honey && form.elements._honey.value) return; // bot

    var d = collect();
    btnSubmit.disabled = true; btnBack.disabled = true;
    btnSubmit.classList.add("is-loading");
    btnSubmit.querySelector(".lbl").textContent = "Отправляем…";
    hideError();

    anySuccess([sendEmail(d), sendCrm(d)]).then(function () {
      clearDraft();
      form.hidden = true;
      document.getElementById("successName").textContent = d.name ? "Спасибо, " + d.name : "Спасибо";
      success.classList.add("is-visible");
      success.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof window.ym === "function") try { window.ym(0, "reachGoal", "vacancy_submit"); } catch (err) {}
    }).catch(function () {
      showError("Не удалось отправить анкету — проверьте интернет и попробуйте ещё раз. " +
        "Или <a href=\"" + mailtoLink(d) + "\">отправьте её письмом</a> — все ответы подставятся автоматически.");
    }).then(function () {
      btnSubmit.disabled = false; btnBack.disabled = false;
      btnSubmit.classList.remove("is-loading");
      btnSubmit.querySelector(".lbl").textContent = "Откликнуться";
    });
  });

  showStep(0, false);

  // ---------- mobile sticky CTA ----------
  var mcta = document.getElementById("mobileCta");
  var anketa = document.getElementById("anketa");
  var hero = document.querySelector(".hero");
  if (mcta && hero && anketa) {
    // показываем кнопку только между первым экраном и анкетой
    var ticking = false;
    var upd = function () {
      ticking = false;
      var vh = window.innerHeight;
      var pastHero = hero.getBoundingClientRect().bottom < 0;
      var beforeForm = anketa.getBoundingClientRect().top > vh * 0.85;
      mcta.classList.toggle("is-visible", pastHero && beforeForm);
    };
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }
})();
