// Dashboard JS: modal, cálculos y deducciones extra
(function () {
    // Helpers
    const $ = id => document.getElementById(id);
    const format = v => Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

    // Elements
    const btnAddSalary = $('btnAddSalary');
    const salaryModal = $('salaryModal');
    const monthlySalaryInput = $('monthlySalary');
    const saveSalaryBtn = $('saveSalary');
    const cancelSalaryBtn = $('cancelSalary');

    const salaryMonthlyEl = $('salaryMonthly');
    const salaryBiweeklyEl = $('salaryBiweekly');
    const salaryAnnualEl = $('salaryAnnual');
    const socialInsuranceEl = $('socialInsurance');
    const educationalInsuranceEl = $('educationalInsurance');
    const incomeTaxEl = $('incomeTax');
    const netSalaryEl = $('netSalary');

    const btnAddExtra = $('btnAddExtra');
    const extraDeductionsList = $('extraDeductionsList');
    const extraDeductionsSummary = $('extraDeductionsSummary');

    // State
    let state = {
        monthlySalary: null,
        extras: [] // {id, name, amount}
    };

    const STORAGE_KEY = 'cuentas_dashboard_v1';

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) state = JSON.parse(raw);
        } catch (e) { console.error(e) }
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    let lastFocused = null;
    function openModal() {
        lastFocused = document.activeElement;
        salaryModal.classList.remove('hidden');
        salaryModal.setAttribute('aria-hidden', 'false');
        monthlySalaryInput.value = state.monthlySalary ?? '';
        // small timeout to ensure visible then focus
        setTimeout(() => monthlySalaryInput.focus(), 60);
    }
    function closeModal() {
        salaryModal.classList.add('hidden');
        salaryModal.setAttribute('aria-hidden', 'true');
        try { if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus(); } catch (e) { }
    }

    function calcAndRender() {
        const m = parseFloat(state.monthlySalary);
        if (!Number.isFinite(m) || m <= 0) {
            salaryMonthlyEl.textContent = '-';
            salaryBiweeklyEl.textContent = '-';
            salaryAnnualEl.textContent = '-';
            socialInsuranceEl.textContent = '-';
            educationalInsuranceEl.textContent = '-';
            incomeTaxEl.textContent = '-';
            netSalaryEl.textContent = '-';
            extraDeductionsSummary.innerHTML = '';
            return;
        }

        const monthly = m;
        const biweekly = monthly / 2;
        const annual = monthly * 13; // según requerimiento

        // Deducciones legales
        const social = monthly * 0.095;
        const educ = monthly * 0.025;

        // ISR según rangos
        let isr = 0;
        if (annual > 50000) {
            isr = monthly * 0.25;
        } else if (annual >= 11000) {
            isr = monthly * 0.15;
        } else {
            isr = 0;
        }

        // Extras sum
        const extrasTotal = state.extras.reduce((s, e) => s + Number(e.amount || 0), 0);

        // Net annual and monthly
        const totalMonthlyDeductions = social + educ + isr + extrasTotal;
        const netMonthly = monthly - totalMonthlyDeductions;
        //const netMonthly = netAnnual / 12;

        // Render
        salaryMonthlyEl.textContent = `$ ${format(monthly)}`;
        salaryBiweeklyEl.textContent = `$ ${format(biweekly)}`;
        salaryAnnualEl.textContent = `$ ${format(annual)}`;
        socialInsuranceEl.textContent = `$ ${format(social)}`;
        educationalInsuranceEl.textContent = `$ ${format(educ)}`;
        incomeTaxEl.textContent = `$ ${format(isr)}`;
        netSalaryEl.textContent = `$ ${format(netMonthly)}`;

        // Render extras list summary
        extraDeductionsSummary.innerHTML = '';
        if (state.extras.length === 0) {
            extraDeductionsSummary.textContent = 'No hay deducciones extra.';
        } else {
            const ul = document.createElement('div');
            state.extras.forEach(ex => {
                const el = document.createElement('div');
                el.className = 'calc';
                const label = document.createElement('label');
                label.textContent = ex.name;
                const val = document.createElement('div');
                val.textContent = `$ ${format(Number(ex.amount || 0))}`;
                el.appendChild(label);
                el.appendChild(val);
                extraDeductionsSummary.appendChild(el);
            })
            const totalEl = document.createElement('div');
            totalEl.className = 'calc total';
            const lab = document.createElement('label');
            lab.textContent = 'Total extras:';
            const va = document.createElement('div');
            va.textContent = `$ ${format(extrasTotal)}`;
            totalEl.appendChild(lab);
            totalEl.appendChild(va);
            extraDeductionsSummary.appendChild(totalEl);
        }
    }

    function renderExtrasInputs() {
        extraDeductionsList.innerHTML = '';
        state.extras.forEach(ex => {
            const wrap = document.createElement('div');
            wrap.className = 'extra-item';
            const name = document.createElement('input');
            name.type = 'text';
            name.placeholder = 'Nombre (p. ej. préstamo)';
            name.value = ex.name;
            name.addEventListener('input', e => {
                ex.name = e.target.value;
                save();
                calcAndRender();
            });

            const amount = document.createElement('input');
            amount.type = 'number';
            amount.step = '0.01';
            amount.min = '0';
            amount.placeholder = 'Monto mensual';
            amount.value = ex.amount;
            amount.addEventListener('input', e => {
                ex.amount = parseFloat(e.target.value) || 0;
                save();
                calcAndRender();
            });

            const remove = document.createElement('button');
            remove.className = 'remove';
            remove.textContent = 'Eliminar';
            remove.addEventListener('click', () => {
                state.extras = state.extras.filter(it => it.id !== ex.id);
                save();
                renderExtrasInputs();
                calcAndRender();
            });

            wrap.appendChild(name);
            wrap.appendChild(amount);
            wrap.appendChild(remove);
            extraDeductionsList.appendChild(wrap);
        })
    }

    // Actions
    btnAddSalary.addEventListener('click', openModal);
    cancelSalaryBtn.addEventListener('click', closeModal);

    // inline validation for monthly input
    monthlySalaryInput.addEventListener('input', () => {
        const v = parseFloat(monthlySalaryInput.value);
        if (!Number.isFinite(v) || v < 0) {
            monthlySalaryInput.setAttribute('aria-invalid', 'true');
        } else {
            monthlySalaryInput.removeAttribute('aria-invalid');
        }
    });

    saveSalaryBtn.addEventListener('click', () => {
        const v = parseFloat(monthlySalaryInput.value);
        if (!Number.isFinite(v) || v < 0) {
            monthlySalaryInput.setAttribute('aria-invalid', 'true');
            monthlySalaryInput.focus();
            return;
        }
        state.monthlySalary = v;
        save();
        closeModal();
        calcAndRender();
    });

    btnAddExtra.addEventListener('click', () => {
        const id = Date.now().toString(36);
        state.extras.push({ id, name: '', amount: 0 });
        save();
        renderExtrasInputs();
        calcAndRender();
    });

    // Close modal when clicking outside content
    salaryModal.addEventListener('click', (e) => {
        if (e.target === salaryModal) closeModal();
    })

    // Close modal with Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !salaryModal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Init
    load();
    // set welcome username if available (placeholder behavior)
    const welcome = document.getElementById('welcome');
    const username = document.getElementById('username');
    if (state.userName) {
        welcome.textContent = `Bienvenido, ${state.userName}`;
        username.textContent = '';
    } else {
        welcome.textContent = 'Bienvenido';
        username.textContent = 'Usuario';
    }

    renderExtrasInputs();
    calcAndRender();
})();
