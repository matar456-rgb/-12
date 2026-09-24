/**
 * تطبيق إدارة المبيعات والمصاريف المتكامل والمخصص للجوال (RTL)
 * تشمل: ساعة حية 12 ساعة، حسابات الصافي الفورية، تتبع حالات السداد،
 * تصدير تقارير PDF منفصلة، والتخزين المحلي التلقائي.
 */

// مفاتيح التخزين المحلي والأمان
const STORAGE_SALES_KEY = 'matar_sales_records_v1';
const STORAGE_EXPENSES_KEY = 'matar_expenses_records_v1';
const STORAGE_LAST_UPDATED_KEY = 'matar_data_last_updated_v1';
const STORAGE_BACKUP_SNAPSHOT_KEY = 'matar_emergency_backup_v1';
const CLOUD_SYNC_ENABLED_KEY = 'matar_cloud_sync_enabled_v1';

// حالة التطبيق
let salesData = [];
let expensesData = [];
let lastLocalUpdateTimestamp = Number(localStorage.getItem(STORAGE_LAST_UPDATED_KEY)) || 0;

// =========================================================
// 1. الساعة الرقمية الحية والتاريخ باللغة العربية
// =========================================================

function initLiveClockAndDate() {
  const timeElem = document.getElementById('liveTime');
  const periodElem = document.getElementById('livePeriod');
  const dateElem = document.getElementById('dateString');

  const daysArabic = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const monthsArabic = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  function updateClock() {
    const now = new Date();
    
    // حساب الساعات بنظام 12 ساعة
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const period = hours >= 12 ? 'م' : 'ص';

    hours = hours % 12;
    hours = hours ? hours : 12; // الساعة 0 تصبح 12
    const hoursFormatted = String(hours).padStart(2, '0');

    if (timeElem) timeElem.textContent = `${hoursFormatted}:${minutes}:${seconds}`;
    if (periodElem) periodElem.textContent = period;

    // التاريخ العربي المفصل (مثال: الإثنين، 21 سبتمبر 2026)
    const dayName = daysArabic[now.getDay()];
    const dayNum = now.getDate();
    const monthName = monthsArabic[now.getMonth()];
    const year = now.getFullYear();

    if (dateElem) {
      dateElem.textContent = `${dayName}، ${dayNum} ${monthName} ${year}`;
    }
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// =========================================================
// 2. إدارة التخزين المحلي والبيانات الافتراضية
// =========================================================

function isCloudSyncEnabled() {
  const val = localStorage.getItem(CLOUD_SYNC_ENABLED_KEY);
  return val === null ? true : (val === 'true');
}

function toggleCloudSync() {
  const current = isCloudSyncEnabled();
  const newState = !current;
  localStorage.setItem(CLOUD_SYNC_ENABLED_KEY, newState ? 'true' : 'false');
  updateCloudSyncToggleUI();

  if (newState) {
    showToast('تم تفعيل المزامنة السحابية الفورية', 'success');
    pushDataToCloud(true);
  } else {
    showToast('تم إيقاف المزامنة السحابية (العمل بوضع التخزين المحلي الآمن)', 'info');
    updateCloudBadgeStatus('offline', 'المزامنة متوقفة');
  }
}

function updateCloudSyncToggleUI() {
  const toggleBtn = document.getElementById('cloudSyncToggleBtn');
  const toggleText = document.getElementById('cloudSyncToggleText');
  const enabled = isCloudSyncEnabled();

  if (toggleBtn) {
    toggleBtn.className = enabled ? 'btn btn-sm btn-success' : 'btn btn-sm btn-secondary';
  }
  if (toggleText) {
    toggleText.textContent = enabled ? 'المزامنة مفعلة (شغال)' : 'المزامنة معطلة (محلي فقط)';
  }
}

function loadDataFromStorage() {
  const storedSales = localStorage.getItem(STORAGE_SALES_KEY);
  const storedExpenses = localStorage.getItem(STORAGE_EXPENSES_KEY);

  if (storedSales !== null) {
    try {
      salesData = JSON.parse(storedSales);
      if (!Array.isArray(salesData)) salesData = [];
    } catch (e) {
      salesData = [];
    }
  } else {
    // بيانات أولية للمعاينة الفورية فقط عند التشغيل الأول تماماً
    seedInitialData();
  }

  if (storedExpenses !== null) {
    try {
      expensesData = JSON.parse(storedExpenses);
      if (!Array.isArray(expensesData)) expensesData = [];
    } catch (e) {
      expensesData = [];
    }
  }

  lastLocalUpdateTimestamp = Number(localStorage.getItem(STORAGE_LAST_UPDATED_KEY)) || Date.now();
}

function saveDataToStorage(shouldPush = true) {
  const timestamp = Date.now();
  lastLocalUpdateTimestamp = timestamp;

  try {
    localStorage.setItem(STORAGE_SALES_KEY, JSON.stringify(salesData));
    localStorage.setItem(STORAGE_EXPENSES_KEY, JSON.stringify(expensesData));
    localStorage.setItem(STORAGE_LAST_UPDATED_KEY, String(timestamp));

    // حفظ نسخة احتياطية إضافية للطوارئ تلقائياً في ذاكرة الجهاز
    if (salesData.length > 0 || expensesData.length > 0) {
      localStorage.setItem(STORAGE_BACKUP_SNAPSHOT_KEY, JSON.stringify({
        timestamp,
        sales: salesData,
        expenses: expensesData
      }));
    }
  } catch (err) {
    console.error('فشل الحفظ في LocalStorage:', err);
  }

  updateAllViews();

  // إرسال التحديثات للسحابة فوراً في الخلفية
  if (shouldPush && isCloudSyncEnabled()) {
    scheduleCloudPush();
  }
}

function seedInitialData() {
  const today = new Date().toISOString().split('T')[0];

  salesData = [
    {
      id: 'sale_' + Date.now() + '_1',
      date: today,
      card: 1500.00,
      bankCommission: 15.00,
      transfer: 2200.00,
      cash: 850.00,
      net: (1500.00 - 15.00) + 2200.00 + 850.00, // 4535.00
      notes: 'مبيعات الوردية الصباحية'
    },
    {
      id: 'sale_' + Date.now() + '_2',
      date: today,
      card: 2100.00,
      bankCommission: 21.00,
      transfer: 800.00,
      cash: 1200.00,
      net: (2100.00 - 21.00) + 800.00 + 1200.00, // 4079.00
      notes: 'مبيعات الفرع الرئيسي - مسائي'
    }
  ];

  expensesData = [
    {
      id: 'exp_' + Date.now() + '_1',
      date: today,
      category: 'إيجار',
      amount: 2500.00,
      method: 'تحويل بنكي',
      status: 'مدفوع',
      notes: 'سداد دفعة إيجار المحل'
    },
    {
      id: 'exp_' + Date.now() + '_2',
      date: today,
      category: 'فواتير وكهرباء',
      amount: 450.00,
      method: 'شبكة',
      status: 'مدفوع',
      notes: 'فاتورة الكهرباء لشهر سبتمبر'
    },
    {
      id: 'exp_' + Date.now() + '_3',
      date: today,
      category: 'مشتريات وبضاعة',
      amount: 1800.00,
      method: 'كاش',
      status: 'غير مدفوع',
      notes: 'بضاعة من المورد - مستحقة السبت'
    },
    {
      id: 'exp_' + Date.now() + '_4',
      date: today,
      category: 'صيانة وتشغيل',
      amount: 320.00,
      method: 'كاش',
      status: 'انتظار',
      notes: 'صيانة جهاز التكييف المعلق'
    }
  ];

  localStorage.setItem(STORAGE_SALES_KEY, JSON.stringify(salesData));
  localStorage.setItem(STORAGE_EXPENSES_KEY, JSON.stringify(expensesData));
}

// =========================================================
// 3. تحديث الإحصائيات الشاملة والعلوية (KPIs)
// =========================================================

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateKPIs() {
  // حساب المبيعات
  const totalNetSales = salesData.reduce((acc, curr) => acc + (Number(curr.net) || 0), 0);
  
  // حساب المصاريف
  const totalExpenses = expensesData.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const paidExpenses = expensesData
    .filter(e => e.status === 'مدفوع')
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const unpaidExpenses = expensesData
    .filter(e => e.status === 'غير مدفوع')
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const pendingExpenses = expensesData
    .filter(e => e.status === 'انتظار')
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // حساب صافي الأرباح (صافي المبيعات - إجمالي المصاريف)
  const netProfit = totalNetSales - totalExpenses;

  // تحديث البطاقات العلوية
  const kpiNetSalesElem = document.getElementById('kpiNetSales');
  const kpiTotalExpensesElem = document.getElementById('kpiTotalExpenses');
  const kpiNetProfitElem = document.getElementById('kpiNetProfit');
  const kpiUnpaidNoticeElem = document.getElementById('kpiUnpaidNotice');
  const profitBadgeElem = document.getElementById('profitBadge');

  if (kpiNetSalesElem) kpiNetSalesElem.textContent = formatMoney(totalNetSales);
  if (kpiTotalExpensesElem) kpiTotalExpensesElem.textContent = formatMoney(totalExpenses);
  if (kpiNetProfitElem) kpiNetProfitElem.textContent = formatMoney(netProfit);

  if (kpiUnpaidNoticeElem) {
    kpiUnpaidNoticeElem.textContent = `${formatMoney(unpaidExpenses)} ر.س غير مدفوع`;
  }

  if (profitBadgeElem) {
    if (netProfit > 0) {
      profitBadgeElem.className = 'stat-pill positive';
      profitBadgeElem.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ربح إيجابي`;
    } else if (netProfit < 0) {
      profitBadgeElem.className = 'stat-pill negative';
      profitBadgeElem.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> عجز مالي`;
    } else {
      profitBadgeElem.className = 'stat-pill profit';
      profitBadgeElem.innerHTML = `<i class="fa-solid fa-check"></i> متزن`;
    }
  }

  // تحديث ملخص المصاريف
  const expPaidElem = document.getElementById('expSummaryPaid');
  const expUnpaidElem = document.getElementById('expSummaryUnpaid');
  const expPendingElem = document.getElementById('expSummaryPending');
  const expTotalElem = document.getElementById('expSummaryTotal');

  if (expPaidElem) expPaidElem.textContent = `${formatMoney(paidExpenses)} ر.س`;
  if (expUnpaidElem) expUnpaidElem.textContent = `${formatMoney(unpaidExpenses)} ر.س`;
  if (expPendingElem) expPendingElem.textContent = `${formatMoney(pendingExpenses)} ر.س`;
  if (expTotalElem) expTotalElem.textContent = `${formatMoney(totalExpenses)} ر.س`;

  // تحديث أرقام قسم التقارير
  const repSalesCount = document.getElementById('repSalesCount');
  const repSalesNet = document.getElementById('repSalesNet');
  const repExpPaid = document.getElementById('repExpPaid');
  const repExpUnpaid = document.getElementById('repExpUnpaid');

  if (repSalesCount) repSalesCount.textContent = salesData.length;
  if (repSalesNet) repSalesNet.textContent = `${formatMoney(totalNetSales)} ر.س`;
  if (repExpPaid) repExpPaid.textContent = `${formatMoney(paidExpenses)} ر.س`;
  if (repExpUnpaid) repExpUnpaid.textContent = `${formatMoney(unpaidExpenses)} ر.س`;
}

// =========================================================
// 4. جدول المبيعات الموحد وحساباته التلقائية
// =========================================================

function renderSalesTable() {
  const tbody = document.getElementById('salesTableBody');
  const cardsStream = document.getElementById('salesCardsStream');
  const emptyState = document.getElementById('salesEmptyState');
  if (!tbody || !cardsStream) return;

  tbody.innerHTML = '';
  cardsStream.innerHTML = '';

  if (salesData.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    document.getElementById('salesMobileSummary')?.classList.add('hidden');
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    document.getElementById('salesMobileSummary')?.classList.remove('hidden');
  }

  let sumCard = 0;
  let sumComm = 0;
  let sumTransfer = 0;
  let sumCash = 0;
  let sumNet = 0;

  salesData.forEach((row) => {
    const cardVal = Number(row.card) || 0;
    const commVal = Number(row.bankCommission) || 0;
    const transVal = Number(row.transfer) || 0;
    const cashVal = Number(row.cash) || 0;
    const netVal = Number(row.net) || 0;

    sumCard += cardVal;
    sumComm += commVal;
    sumTransfer += transVal;
    sumCash += cashVal;
    sumNet += netVal;

    // 1. إنشاء صف الجدول الموحد
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row.date}</strong></td>
      <td>${formatMoney(row.card)}</td>
      <td class="text-danger">${formatMoney(row.bankCommission)}</td>
      <td>${formatMoney(row.transfer)}</td>
      <td>${formatMoney(row.cash)}</td>
      <td class="cell-net">${formatMoney(row.net)}</td>
      <td><small>${row.notes || '-'}</small></td>
      <td class="text-center">
        <div class="table-actions">
          <button class="action-btn" title="تعديل العملية" onclick="editSale('${row.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="action-btn delete" title="حذف العملية" onclick="deleteSale('${row.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. إنشاء بطاقة الجوال الذكية المخصصة للهواتف
    const cardElem = document.createElement('div');
    cardElem.className = 'mobile-record-card';
    cardElem.innerHTML = `
      <div class="card-top-header">
        <div class="card-date-badge">
          <i class="fa-regular fa-calendar"></i>
          <span>${row.date}</span>
        </div>
        <div class="table-actions">
          <button class="action-btn" title="تعديل" onclick="editSale('${row.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="action-btn delete" title="حذف" onclick="deleteSale('${row.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <div class="card-main-amount">
        <span class="amount-label">الصافي الفعلي المحسوب:</span>
        <div class="amount-value-group">
          <span class="amount-val-highlight">${formatMoney(row.net)}</span>
          <span class="stat-currency">ر.س</span>
        </div>
      </div>

      <div class="card-details-grid">
        <div class="detail-chip">
          <span>💳 شبكة:</span>
          <strong>${formatMoney(row.card)}</strong>
        </div>
        <div class="detail-chip">
          <span>📉 عمولة البنك:</span>
          <strong class="comm">${formatMoney(row.bankCommission)}</strong>
        </div>
        <div class="detail-chip">
          <span>🔄 تحويل:</span>
          <strong>${formatMoney(row.transfer)}</strong>
        </div>
        <div class="detail-chip">
          <span>💵 كاش:</span>
          <strong>${formatMoney(row.cash)}</strong>
        </div>
      </div>

      ${row.notes ? `
        <div class="card-notes-row">
          <i class="fa-regular fa-message"></i>
          <span>${row.notes}</span>
        </div>
      ` : ''}
    `;
    cardsStream.appendChild(cardElem);
  });

  // تحديث شريط إجماليات الجدول
  document.getElementById('totCard').textContent = formatMoney(sumCard);
  document.getElementById('totComm').textContent = formatMoney(sumComm);
  document.getElementById('totTransfer').textContent = formatMoney(sumTransfer);
  document.getElementById('totCash').textContent = formatMoney(sumCash);
  document.getElementById('totNet').textContent = formatMoney(sumNet);

  // تحديث شريط إجماليات بطاقات الجوال
  const mobTotNetElem = document.getElementById('mobTotNet');
  const mobBreakdownElem = document.getElementById('mobSalesBreakdown');
  if (mobTotNetElem) mobTotNetElem.textContent = `${formatMoney(sumNet)} ر.س`;
  if (mobBreakdownElem) {
    mobBreakdownElem.textContent = `شبكة: ${formatMoney(sumCard)} | تحويل: ${formatMoney(sumTransfer)} | كاش: ${formatMoney(sumCash)}`;
  }
}

// حساب الصافي التلقائي الفوري داخل النافذة المنبثقة
function calculateModalNet() {
  const card = parseFloat(document.getElementById('saleCard').value) || 0;
  const comm = parseFloat(document.getElementById('saleComm').value) || 0;
  const transfer = parseFloat(document.getElementById('saleTransfer').value) || 0;
  const cash = parseFloat(document.getElementById('saleCash').value) || 0;

  // المعادلة المحددة: (شبكة - عمولة البنك) + تحويل + كاش
  const net = (card - comm) + transfer + cash;
  const label = document.getElementById('modalCalculatedNet');
  if (label) {
    label.textContent = `${formatMoney(net)} ر.س`;
  }
  return net;
}

function openAddSalesModal() {
  document.getElementById('salesModalTitle').innerHTML = '<i class="fa-solid fa-cart-plus"></i> تسجيل عملية بيع جديدة';
  document.getElementById('salesForm').reset();
  document.getElementById('salesEditId').value = '';
  document.getElementById('saleDate').value = new Date().toISOString().split('T')[0];
  calculateModalNet();
  document.getElementById('salesModal').classList.add('active');
}

function closeSalesModal() {
  document.getElementById('salesModal').classList.remove('active');
}

function editSale(id) {
  const item = salesData.find(s => s.id === id);
  if (!item) return;

  document.getElementById('salesModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل عملية بيع';
  document.getElementById('salesEditId').value = item.id;
  document.getElementById('saleDate').value = item.date;
  document.getElementById('saleCard').value = item.card || '';
  document.getElementById('saleComm').value = item.bankCommission || '';
  document.getElementById('saleTransfer').value = item.transfer || '';
  document.getElementById('saleCash').value = item.cash || '';
  document.getElementById('saleNotes').value = item.notes || '';

  calculateModalNet();
  document.getElementById('salesModal').classList.add('active');
}

function handleSalesFormSubmit(event) {
  event.preventDefault();

  const editId = document.getElementById('salesEditId').value;
  const date = document.getElementById('saleDate').value;
  const card = parseFloat(document.getElementById('saleCard').value) || 0;
  const bankCommission = parseFloat(document.getElementById('saleComm').value) || 0;
  const transfer = parseFloat(document.getElementById('saleTransfer').value) || 0;
  const cash = parseFloat(document.getElementById('saleCash').value) || 0;
  const notes = document.getElementById('saleNotes').value.trim();

  // حساب الصافي تلقائياً: (شبكة - عمولة) + تحويل + كاش
  const net = (card - bankCommission) + transfer + cash;

  if (editId) {
    // تعديل
    const index = salesData.findIndex(s => s.id === editId);
    if (index !== -1) {
      salesData[index] = {
        ...salesData[index],
        date,
        card,
        bankCommission,
        transfer,
        cash,
        net,
        notes
      };
      showToast('تم تحديث عملية البيع بنجاح', 'success');
    }
  } else {
    // إضافة جديدة
    const newSale = {
      id: 'sale_' + Date.now(),
      date,
      card,
      bankCommission,
      transfer,
      cash,
      net,
      notes
    };
    salesData.unshift(newSale); // إضافتها في البداية
    showToast('تمت إضافة عملية البيع بنجاح', 'success');
  }

  saveDataToStorage();
  closeSalesModal();
}

function deleteSale(id) {
  requestSecurityPin('هل أنت متأكد من حذف عملية البيع هذه نهائياً؟', () => {
    salesData = salesData.filter(s => s.id !== id);
    saveDataToStorage();
    showToast('تم حذف عملية البيع بنجاح', 'error');
  });
}

// =========================================================
// 5. قسم وجدول المصاريف وتتبع حالات السداد
// =========================================================

function renderExpensesTable() {
  const tbody = document.getElementById('expensesTableBody');
  const cardsStream = document.getElementById('expensesCardsStream');
  const emptyState = document.getElementById('expensesEmptyState');
  if (!tbody || !cardsStream) return;

  tbody.innerHTML = '';
  cardsStream.innerHTML = '';

  if (expensesData.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
  } else {
    if (emptyState) emptyState.classList.add('hidden');
  }

  let totalExp = 0;

  expensesData.forEach((row) => {
    totalExp += Number(row.amount) || 0;

    let statusClass = 'paid';
    let statusIcon = 'fa-circle-check';
    if (row.status === 'غير مدفوع') {
      statusClass = 'unpaid';
      statusIcon = 'fa-circle-xmark';
    } else if (row.status === 'انتظار') {
      statusClass = 'pending';
      statusIcon = 'fa-clock';
    }

    // 1. صف جدول المصاريف
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row.date}</strong></td>
      <td><i class="fa-solid fa-tag text-muted"></i> ${row.category}</td>
      <td class="cell-net">${formatMoney(row.amount)}</td>
      <td><span class="badge-method">${row.method || 'كاش'}</span></td>
      <td>
        <span class="status-badge ${statusClass}" title="انقر للتبديل السريع" style="cursor: pointer;" onclick="cycleExpenseStatus('${row.id}')">
          <i class="fa-solid ${statusIcon}"></i> ${row.status}
        </span>
      </td>
      <td><small>${row.notes || '-'}</small></td>
      <td class="text-center">
        <div class="table-actions">
          <button class="action-btn status-toggle" title="تغيير حالة السداد" onclick="cycleExpenseStatus('${row.id}')">
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
          <button class="action-btn" title="تعديل المصروف" onclick="editExpense('${row.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="action-btn delete" title="حذف المصروف" onclick="deleteExpense('${row.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. بطاقة مصروف ذكية للجوال
    const cardElem = document.createElement('div');
    cardElem.className = 'mobile-record-card expense-card';
    cardElem.innerHTML = `
      <div class="card-top-header">
        <div class="card-date-badge">
          <i class="fa-regular fa-calendar"></i>
          <span>${row.date}</span>
          <span style="margin-right: 6px; color: var(--text-main); font-weight: 800;">
            <i class="fa-solid fa-tag" style="color: var(--warning);"></i> ${row.category}
          </span>
        </div>
        <div class="table-actions">
          <button class="action-btn status-toggle" title="تبديل حالة السداد" onclick="cycleExpenseStatus('${row.id}')">
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
          <button class="action-btn" title="تعديل" onclick="editExpense('${row.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="action-btn delete" title="حذف" onclick="deleteExpense('${row.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <div class="card-main-amount">
        <span class="amount-label">مبلغ المصروف:</span>
        <div class="amount-value-group">
          <span class="amount-val-highlight amount-val-expense">${formatMoney(row.amount)}</span>
          <span class="stat-currency">ر.س</span>
        </div>
      </div>

      <div class="card-details-grid">
        <div class="detail-chip">
          <span>طريقة السداد:</span>
          <strong>${row.method || 'كاش'}</strong>
        </div>
        <div class="detail-chip">
          <span>حالة السداد:</span>
          <span class="status-badge ${statusClass}" style="cursor: pointer;" onclick="cycleExpenseStatus('${row.id}')">
            <i class="fa-solid ${statusIcon}"></i> ${row.status}
          </span>
        </div>
      </div>

      ${row.notes ? `
        <div class="card-notes-row">
          <i class="fa-regular fa-message"></i>
          <span>${row.notes}</span>
        </div>
      ` : ''}
    `;
    cardsStream.appendChild(cardElem);
  });

  const totExpAmountElem = document.getElementById('totExpAmount');
  const totExpDetailsElem = document.getElementById('totExpDetails');
  if (totExpAmountElem) totExpAmountElem.textContent = formatMoney(totalExp);
  if (totExpDetailsElem) totExpDetailsElem.textContent = `${expensesData.length} عملية مسجلة`;
}

function openAddExpenseModal() {
  document.getElementById('expenseModalTitle').innerHTML = '<i class="fa-solid fa-hand-holding-dollar"></i> تسجيل مصروف جديد';
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseEditId').value = '';
  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('expensesModal').classList.add('active');
}

function closeExpenseModal() {
  document.getElementById('expensesModal').classList.remove('active');
}

function editExpense(id) {
  const item = expensesData.find(e => e.id === id);
  if (!item) return;

  document.getElementById('expenseModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل المصروف';
  document.getElementById('expenseEditId').value = item.id;
  document.getElementById('expDate').value = item.date;
  document.getElementById('expCategory').value = item.category;
  document.getElementById('expAmount').value = item.amount;
  document.getElementById('expMethod').value = item.method;
  document.getElementById('expStatus').value = item.status;
  document.getElementById('expNotes').value = item.notes || '';

  document.getElementById('expensesModal').classList.add('active');
}

function cycleExpenseStatus(id) {
  const item = expensesData.find(e => e.id === id);
  if (!item) return;

  // تبديل دوري: مدفوع -> غير مدفوع -> انتظار -> مدفوع
  if (item.status === 'مدفوع') {
    item.status = 'غير مدفوع';
  } else if (item.status === 'غير مدفوع') {
    item.status = 'انتظار';
  } else {
    item.status = 'مدفوع';
  }

  saveDataToStorage();
  showToast(`تم تغيير الحالة إلى: ${item.status}`, 'success');
}

function handleExpenseFormSubmit(event) {
  event.preventDefault();

  const editId = document.getElementById('expenseEditId').value;
  const date = document.getElementById('expDate').value;
  const category = document.getElementById('expCategory').value;
  const amount = parseFloat(document.getElementById('expAmount').value) || 0;
  const method = document.getElementById('expMethod').value;
  const status = document.getElementById('expStatus').value;
  const notes = document.getElementById('expNotes').value.trim();

  if (editId) {
    const index = expensesData.findIndex(e => e.id === editId);
    if (index !== -1) {
      expensesData[index] = {
        ...expensesData[index],
        date,
        category,
        amount,
        method,
        status,
        notes
      };
      showToast('تم تحديث بيانات المصروف بنجاح', 'success');
    }
  } else {
    const newExp = {
      id: 'exp_' + Date.now(),
      date,
      category,
      amount,
      method,
      status,
      notes
    };
    expensesData.unshift(newExp);
    showToast('تمت إضافة المصروف بنجاح', 'success');
  }

  saveDataToStorage();
  closeExpenseModal();
}

function deleteExpense(id) {
  requestSecurityPin('هل أنت متأكد من حذف هذا المصروف نهائياً؟', () => {
    expensesData = expensesData.filter(e => e.id !== id);
    saveDataToStorage();
    showToast('تم حذف المصروف بنجاح', 'error');
  });
}

// =========================================================
// 6. تصدير وطباعة تقارير PDF المستقلة عالية الجودة
// =========================================================

// إنشاء ترويسة التقرير
function buildReportHeader(title, subtitle) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="pdf-header">
      <div class="pdf-title-block">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="pdf-meta-block">
        <span><strong>تاريخ الاستخراج:</strong> ${dateStr}</span>
        <span><strong>الوقت:</strong> ${timeStr}</span>
        <span><strong>نظام الإدارة:</strong> نسخة الجوال المتكاملة</span>
      </div>
    </div>
  `;
}

// أ. تحميل تقرير المبيعات PDF لوحده
function exportSalesPDF() {
  if (salesData.length === 0) {
    showToast('لا توجد مبيعات لتصدير التقرير!', 'error');
    return;
  }

  showToast('جارٍ تجهيز وتحميل تقرير المبيعات PDF...', 'success');

  const container = document.getElementById('pdfExportContainer');
  let sumCard = 0, sumComm = 0, sumTransfer = 0, sumCash = 0, sumNet = 0;

  const rowsHtml = salesData.map((row, idx) => {
    sumCard += Number(row.card) || 0;
    sumComm += Number(row.bankCommission) || 0;
    sumTransfer += Number(row.transfer) || 0;
    sumCash += Number(row.cash) || 0;
    sumNet += Number(row.net) || 0;

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${row.date}</td>
        <td>${formatMoney(row.card)}</td>
        <td style="color: #dc2626;">${formatMoney(row.bankCommission)}</td>
        <td>${formatMoney(row.transfer)}</td>
        <td>${formatMoney(row.cash)}</td>
        <td style="font-weight: bold; color: #059669;">${formatMoney(row.net)}</td>
        <td>${row.notes || '-'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="pdf-print-page" id="printableSalesDoc">
      ${buildReportHeader('تقرير المبيعات الموحد', 'كشف تفصيلي بالعمليات والشبكة وعمولات البنك والتحويل والكاش والصافي')}
      
      <div class="pdf-summary-cards">
        <div class="pdf-sum-card">
          <span>إجمالي الشبكة</span>
          <strong>${formatMoney(sumCard)} ر.س</strong>
        </div>
        <div class="pdf-sum-card">
          <span>إجمالي عمولة البنك</span>
          <strong style="color: #dc2626;">${formatMoney(sumComm)} ر.س</strong>
        </div>
        <div class="pdf-sum-card">
          <span>إجمالي التحويل + كاش</span>
          <strong>${formatMoney(sumTransfer + sumCash)} ر.س</strong>
        </div>
        <div class="pdf-sum-card" style="border-color: #059669; background: #ecfdf5;">
          <span style="color: #059669; font-weight: bold;">صافي المبيعات الفعلي</span>
          <strong style="color: #059669; font-size: 1.25rem;">${formatMoney(sumNet)} ر.س</strong>
        </div>
      </div>

      <table class="pdf-table">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">#</th>
            <th>التاريخ</th>
            <th>شبكة (ر.س)</th>
            <th>عمولة البنك</th>
            <th>تحويل (ر.س)</th>
            <th>كاش (ر.س)</th>
            <th>الصافي (ر.س)</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="text-align: center; font-weight: bold;">الإجمالي الكلي:</td>
            <td>${formatMoney(sumCard)}</td>
            <td style="color: #dc2626;">${formatMoney(sumComm)}</td>
            <td>${formatMoney(sumTransfer)}</td>
            <td>${formatMoney(sumCash)}</td>
            <td style="font-weight: bold; color: #059669;">${formatMoney(sumNet)}</td>
            <td>${salesData.length} عملية</td>
          </tr>
        </tfoot>
      </table>

      <div class="pdf-footer">
        <span>المعادلة المطبقة: الصافي = (شبكة - عمولة البنك) + تحويل + كاش</span>
        <span>تقرير معتمد إلكترونياً</span>
      </div>
    </div>
  `;

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `تقرير_المبيعات_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  const element = document.getElementById('printableSalesDoc');
  html2pdf().set(opt).from(element).save().then(() => {
    container.innerHTML = '';
  });
}

// ب. تحميل تقرير المصاريف PDF لوحده
function exportExpensesPDF() {
  if (expensesData.length === 0) {
    showToast('لا توجد مصاريف لتصدير التقرير!', 'error');
    return;
  }

  showToast('جارٍ تجهيز وتحميل تقرير المصاريف PDF...', 'success');

  const container = document.getElementById('pdfExportContainer');
  let sumTotal = 0, sumPaid = 0, sumUnpaid = 0, sumPending = 0;

  const rowsHtml = expensesData.map((row, idx) => {
    const amt = Number(row.amount) || 0;
    sumTotal += amt;
    if (row.status === 'مدفوع') sumPaid += amt;
    else if (row.status === 'غير مدفوع') sumUnpaid += amt;
    else sumPending += amt;

    let badgeColor = '#059669';
    if (row.status === 'غير مدفوع') badgeColor = '#dc2626';
    else if (row.status === 'انتظار') badgeColor = '#d97706';

    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${row.date}</td>
        <td style="font-weight: bold;">${row.category}</td>
        <td style="font-weight: bold;">${formatMoney(row.amount)}</td>
        <td>${row.method || 'كاش'}</td>
        <td style="font-weight: bold; color: ${badgeColor};">${row.status}</td>
        <td>${row.notes || '-'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="pdf-print-page" id="printableExpensesDoc">
      ${buildReportHeader('تقرير المصاريف وتتبع السداد', 'كشف تفصيلي بالنفقات، الفواتير، وحالات السداد المسجلة')}
      
      <div class="pdf-summary-cards">
        <div class="pdf-sum-card" style="border-color: #059669; background: #ecfdf5;">
          <span style="color: #059669;">المسدد (مدفوع)</span>
          <strong style="color: #059669;">${formatMoney(sumPaid)} ر.س</strong>
        </div>
        <div class="pdf-sum-card" style="border-color: #dc2626; background: #fef2f2;">
          <span style="color: #dc2626;">المستحق (غير مدفوع)</span>
          <strong style="color: #dc2626;">${formatMoney(sumUnpaid)} ر.س</strong>
        </div>
        <div class="pdf-sum-card" style="border-color: #d97706; background: #fffbeb;">
          <span style="color: #d97706;">في الانتظار (معلق)</span>
          <strong style="color: #d97706;">${formatMoney(sumPending)} ر.س</strong>
        </div>
        <div class="pdf-sum-card">
          <span>إجمالي المصاريف</span>
          <strong style="font-size: 1.25rem;">${formatMoney(sumTotal)} ر.س</strong>
        </div>
      </div>

      <table class="pdf-table">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">#</th>
            <th>التاريخ</th>
            <th>نوع المصروف</th>
            <th>المبلغ (ر.س)</th>
            <th>طريقة السداد</th>
            <th>حالة السداد</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align: center; font-weight: bold;">الإجمالي الكلي للمصاريف:</td>
            <td style="font-weight: bold;">${formatMoney(sumTotal)} ر.س</td>
            <td colspan="3">${expensesData.length} عملية مسجلة</td>
          </tr>
        </tfoot>
      </table>

      <div class="pdf-footer">
        <span>تقرير المصاريف وتتبع السداد المالي</span>
        <span>تقرير معتمد إلكترونياً</span>
      </div>
    </div>
  `;

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `تقرير_المصاريف_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const element = document.getElementById('printableExpensesDoc');
  html2pdf().set(opt).from(element).save().then(() => {
    container.innerHTML = '';
  });
}

// ج. تحميل التقرير المالي الشامل (مبيعات + مصاريف + صافي أرباح)
function exportCombinedPDF() {
  showToast('جارٍ إعداد التقرير المالي الشامل PDF...', 'success');

  const container = document.getElementById('pdfExportContainer');
  const totalSales = salesData.reduce((acc, c) => acc + (Number(c.net) || 0), 0);
  const totalExp = expensesData.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const netProfit = totalSales - totalExp;

  container.innerHTML = `
    <div class="pdf-print-page" id="printableCombinedDoc">
      ${buildReportHeader('التقرير المالي الختامي الشامل', 'ملخص المبيعات، المصاريف، والميزانية وصافي الأرباح')}

      <div class="pdf-summary-cards" style="margin-top: 15px;">
        <div class="pdf-sum-card" style="border-color: #059669; background: #ecfdf5;">
          <span style="color: #059669;">إجمالي صافي المبيعات</span>
          <strong style="color: #059669; font-size: 1.3rem;">${formatMoney(totalSales)} ر.س</strong>
        </div>
        <div class="pdf-sum-card" style="border-color: #dc2626; background: #fef2f2;">
          <span style="color: #dc2626;">إجمالي كافة المصاريف</span>
          <strong style="color: #dc2626; font-size: 1.3rem;">${formatMoney(totalExp)} ر.س</strong>
        </div>
        <div class="pdf-sum-card" style="border-color: #4f46e5; background: #eef2ff;">
          <span style="color: #4f46e5;">صافي الأرباح النهائي</span>
          <strong style="color: #4f46e5; font-size: 1.3rem;">${formatMoney(netProfit)} ر.س</strong>
        </div>
      </div>

      <div style="margin-top: 25px; padding: 15px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc;">
        <h3 style="font-size: 1rem; color: #0f172a; margin-bottom: 8px;">مؤشرات الأداء المالي:</h3>
        <p style="font-size: 0.85rem; color: #475569; margin-bottom: 5px;">
          • إجمالي عدد عمليات البيع المسجلة: <strong>${salesData.length}</strong> عملية.
        </p>
        <p style="font-size: 0.85rem; color: #475569; margin-bottom: 5px;">
          • إجمالي عدد عمليات المصاريف: <strong>${expensesData.length}</strong> بنود.
        </p>
        <p style="font-size: 0.85rem; color: #475569; margin-bottom: 5px;">
          • هامش الربح المحقق: <strong>${totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0}%</strong>
        </p>
      </div>

      <div class="pdf-footer" style="margin-top: 40px;">
        <span>التقرير المالي الموحد لنظام إدارة المبيعات والمصاريف للجوال</span>
        <span>تقرير رسمي مستخرج إلكترونياً</span>
      </div>
    </div>
  `;

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `التقرير_المالي_الشامل_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const element = document.getElementById('printableCombinedDoc');
  html2pdf().set(opt).from(element).save().then(() => {
    container.innerHTML = '';
  });
}

// د. الطباعة المباشرة عبر المتصفح
function printSection(section) {
  if (section === 'sales') {
    exportSalesPDF();
  } else if (section === 'expenses') {
    exportExpensesPDF();
  }
}

// =========================================================
// 7. إدارة التبويبات والتنقل (Navigation & Tabs)
// =========================================================

function initNavigation() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  const panels = document.querySelectorAll('.tab-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-tab');
      if (!targetId) return;

      navItems.forEach(n => n.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  

  // أزرار النوافذ العادية
  document.getElementById('openSalesModalBtn')?.addEventListener('click', openAddSalesModal);
  document.getElementById('openExpensesModalBtn')?.addEventListener('click', openAddExpenseModal);

  // مستمعات الحساب التلقائي داخل نموذج المبيعات
  const calcInputs = document.querySelectorAll('.calc-trigger');
  calcInputs.forEach(input => {
    input.addEventListener('input', calculateModalNet);
  });
}



// =========================================================
// 8. النسخ الاحتياطي وإدارة البيانات
// =========================================================

function saveBackupToGoogleDrive() {
  const backupData = {
    appName: 'تطبيق إدارة المبيعات والمصاريف',
    exportDate: new Date().toISOString(),
    sales: salesData,
    expenses: expensesData,
    securityPin: getSecurityPin(),
    cloudBinId: activeCloudBinId
  };

  const jsonString = JSON.stringify(backupData, null, 2);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const fileName = 'نسخة_المبيعات_والمصاريف_' + dateStr + '.json';
  const file = new File([jsonString], fileName, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({
      files: [file],
      title: 'نسخة احتياطية - المبيعات والمصاريف',
      text: 'حفظ النسخة الاحتياطية في Google Drive'
    }).then(() => {
      showToast('تم فتح المشاركة لحفظ النسخة في Google Drive', 'success');
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        fallbackDownloadBackup(jsonString, fileName);
      }
    });
  } else {
    fallbackDownloadBackup(jsonString, fileName);
    setTimeout(() => {
      if (confirm('تم تنزيل ملف النسخة الاحتياطية بنجاح على جهازك.\n\nهل ترغب في فتح موقع Google Drive الآن لرفع الملف عليه؟')) {
        window.open('https://drive.google.com/drive/u/0/my-drive', '_blank');
      }
    }, 400);
  }
}

function fallbackDownloadBackup(jsonString, fileName) {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('تم تنزيل ملف النسخة الاحتياطية بنجاح', 'success');
}

function exportBackupJSON() {
  const data = {
    exportDate: new Date().toISOString(),
    version: '1.0',
    sales: salesData,
    expenses: expensesData
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `نسخة_احتياطية_المبيعات_والمصاريف_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('تم تصدير النسخة الاحتياطية بنجاح', 'success');
}

function importBackupJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.sales && Array.isArray(parsed.sales)) {
        salesData = parsed.sales;
      }
      if (parsed.expenses && Array.isArray(parsed.expenses)) {
        expensesData = parsed.expenses;
      }
      saveDataToStorage();
      showToast('تمت استعادة البيانات بنجاح!', 'success');
    } catch (err) {
      showToast('الملف غير صالح أو تالف!', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function confirmResetAllData() {
  requestSecurityPin('تحذير شديد: سيتم تصفير ومسح كافة سجلات المبيعات والمصاريف بالكامل! لا يمكن التراجع بعد ذلك.', () => {
    salesData = [];
    expensesData = [];
    saveDataToStorage();
    showToast('تم تصفير كافة البيانات بنجاح', 'error');
  });
}


// =========================================================
// 8.1 نظام الأمان والحماية بالرقم السري (Security PIN System)
// =========================================================
const PIN_STORAGE_KEY = 'sales_app_security_pin';
const DEFAULT_PIN = '1234';

function getSecurityPin() {
  return localStorage.getItem(PIN_STORAGE_KEY) || DEFAULT_PIN;
}

function setSecurityPin(newPin) {
  localStorage.setItem(PIN_STORAGE_KEY, newPin);
}

let pendingPinAction = null;

function requestSecurityPin(message, onConfirmAction, isDestructive = true) {
  pendingPinAction = onConfirmAction;
  const modal = document.getElementById('pinSecurityModal');
  const msgEl = document.getElementById('pinModalMessage');
  const pinInput = document.getElementById('securityPinInput');
  const errorEl = document.getElementById('pinErrorMsg');
  const confirmBtn = document.getElementById('pinConfirmBtn');

  if (msgEl) msgEl.textContent = message;
  if (pinInput) {
    pinInput.value = '';
    pinInput.classList.remove('input-error');
  }
  if (errorEl) errorEl.classList.add('hidden');
  
  if (confirmBtn) {
    if (isDestructive) {
      confirmBtn.className = 'btn btn-danger flex-1';
      confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> تأكيد الحذف';
    } else {
      confirmBtn.className = 'btn btn-primary flex-1';
      confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> تأكيد';
    }
  }

  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      if (pinInput) pinInput.focus();
    }, 200);
  }
}

function closePinModal() {
  const modal = document.getElementById('pinSecurityModal');
  if (modal) modal.classList.remove('active');
  pendingPinAction = null;
}

function verifyAndExecutePinAction() {
  const pinInput = document.getElementById('securityPinInput');
  const errorEl = document.getElementById('pinErrorMsg');
  const enteredPin = pinInput ? pinInput.value.trim() : '';
  const currentPin = getSecurityPin();

  if (enteredPin === currentPin) {
    closePinModal();
    if (typeof pendingPinAction === 'function') {
      const action = pendingPinAction;
      pendingPinAction = null;
      action();
    }
  } else {
    if (errorEl) errorEl.classList.remove('hidden');
    if (pinInput) {
      pinInput.classList.add('input-error');
      pinInput.select();
    }
    const card = document.querySelector('#pinSecurityModal .modal-card');
    if (card) {
      card.classList.add('shake-anim');
      setTimeout(() => card.classList.remove('shake-anim'), 450);
    }
    showToast('الرقم السري غير صحيح! يرجى إعادة المحاولة', 'error');
  }
}

function openChangePinModal() {
  const modal = document.getElementById('changePinModal');
  const form = document.getElementById('changePinForm');
  if (form) form.reset();
  if (modal) modal.classList.add('active');
}

function closeChangePinModal() {
  const modal = document.getElementById('changePinModal');
  if (modal) modal.classList.remove('active');
}

function handleChangePinSubmit(e) {
  e.preventDefault();
  const currentPinInput = document.getElementById('currentPin').value.trim();
  const newPinInput = document.getElementById('newPin').value.trim();
  const confirmNewPinInput = document.getElementById('confirmNewPin').value.trim();
  const actualCurrentPin = getSecurityPin();

  if (currentPinInput !== actualCurrentPin) {
    showToast('الرقم السري الحالي غير صحيح!', 'error');
    return;
  }

  if (!newPinInput || newPinInput.length < 4) {
    showToast('يجب أن يتكون الرقم السري الجديد من 4 خانات على الأقل', 'warning');
    return;
  }

  if (newPinInput !== confirmNewPinInput) {
    showToast('تأكيد الرقم السري غير متطابق!', 'error');
    return;
  }

  setSecurityPin(newPinInput);
  closeChangePinModal();
  showToast('تم تغيير الرقم السري بنجاح!', 'success');
}

// =========================================================
// 9. رسائل التنبيهات Toast
// =========================================================

function showToast(message, type = 'success') {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove('hidden');

  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2600);
}

// تحديث كل واجهات التطبيق
function updateAllViews() {
  updateKPIs();
  renderSalesTable();
  renderExpensesTable();
}

// =========================================================
// 10. تبديل وضع العرض (بطاقات الجوال الذكية vs الجدول الموحد)
// =========================================================


// =========================================================
// 11. دعم PWA وتثبيت التطبيق على الجوال
// =========================================================

let deferredInstallPrompt = null;

function initPWAAndInstall() {
  // تسجيل Service Worker للعمل دون إنترنت
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        if (reg) reg.update();
        console.log('Service Worker Registered successfully:', reg.scope);
      }).catch((err) => {
        console.log('Service Worker registration skipped or failed:', err);
      });
    });
  }

  const banner = document.getElementById('installAppBanner');
  const installBtn = document.getElementById('btnInstallApp');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (banner && !sessionStorage.getItem('pwa_banner_dismissed')) {
      banner.classList.remove('hidden');
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('شكراً لتثبيت التطبيق على جهازك!', 'success');
        }
        deferredInstallPrompt = null;
        if (banner) banner.classList.add('hidden');
      } else {
        // تنبيه لمستخدمي Safari على آيفون
        showToast('لتثبيت التطبيق على الآيفون: اضغط مشاركة [⎋] ثم (إضافة إلى الشاشة الرئيسية ⊞)', 'success');
      }
    });
  }
}

function dismissInstallBanner() {
  const banner = document.getElementById('installAppBanner');
  if (banner) banner.classList.add('hidden');
  sessionStorage.setItem('pwa_banner_dismissed', 'true');
}

// استجابة اهتزازية لمسية خفيفة للجوال (Haptic)
function triggerHaptic() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(18);
  }
}

// =========================================================
// 12. تشغيل التطبيق عند التحميل
// =========================================================



// =========================================================
// وظائف إضافية: رفع ملفات المبيعات واستعادة الطوارئ وإدارة السحابة
// =========================================================

function handleSalesFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    try {
      // 1. فحص ملف JSON
      if (file.name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const parsed = JSON.parse(text);
        let importedSales = [];
        if (Array.isArray(parsed)) {
          importedSales = parsed;
        } else if (parsed.sales && Array.isArray(parsed.sales)) {
          importedSales = parsed.sales;
        }

        if (importedSales.length > 0) {
          const formatted = importedSales.map((s, idx) => ({
            id: s.id || ('sale_' + Date.now() + '_' + idx),
            date: s.date || new Date().toISOString().split('T')[0],
            card: Number(s.card) || 0,
            bankCommission: Number(s.bankCommission || s.comm) || 0,
            transfer: Number(s.transfer) || 0,
            cash: Number(s.cash) || 0,
            net: Number(s.net) || (((Number(s.card) || 0) - (Number(s.bankCommission || s.comm) || 0)) + (Number(s.transfer) || 0) + (Number(s.cash) || 0)),
            notes: s.notes || ''
          }));

          const merge = confirm('تم العثور على ' + formatted.length + ' عملية بيع.\n\nهل ترغب في دمجها مع المبيعات الحالية؟\n(اضغط موافق للدمج والإضافة، أو اضغط إلغاء لاستبدال السجلات القديمة)');
          if (merge) {
            salesData = [...formatted, ...salesData];
          } else {
            salesData = formatted;
          }
          saveDataToStorage(true);
          showToast('تم رفع وحفظ ' + formatted.length + ' عملية بيع بنجاح!', 'success');
          return;
        }
      }

      // 2. فحص ملف CSV / نصي (Excel exported CSV)
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length > 0) {
        const parsedRows = [];
        const firstLineParts = lines[0].split(/[,;\t]/);
        const startIndex = isNaN(parseFloat(firstLineParts[1])) ? 1 : 0; // تجاوز سطر العناوين إن وجد

        for (let i = startIndex; i < lines.length; i++) {
          const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length < 2) continue;

          const date = cols[0] || new Date().toISOString().split('T')[0];
          const card = parseFloat(cols[1]) || 0;
          const bankCommission = parseFloat(cols[2]) || 0;
          const transfer = parseFloat(cols[3]) || 0;
          const cash = parseFloat(cols[4]) || 0;
          const notes = cols[5] || '';
          const net = (card - bankCommission) + transfer + cash;

          parsedRows.push({
            id: 'sale_' + Date.now() + '_' + i,
            date,
            card,
            bankCommission,
            transfer,
            cash,
            net,
            notes
          });
        }

        if (parsedRows.length > 0) {
          salesData = [...parsedRows, ...salesData];
          saveDataToStorage(true);
          showToast('تم رفع واستيراد ' + parsedRows.length + ' عملية بيع من الملف بنجاح!', 'success');
        } else {
          showToast('لم يتم العثور على بيانات مبيعات صالحة في الملف المرفوع', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      showToast('خطأ أثناء قراءة الملف، تأكد من صحة التنسيق (JSON أو CSV)', 'error');
    }
  };
  reader.readAsText(file, 'utf-8');
  event.target.value = '';
}

function restoreEmergencySnapshot() {
  const raw = localStorage.getItem(STORAGE_BACKUP_SNAPSHOT_KEY);
  if (!raw) {
    showToast('لا توجد نسخة طوارئ احتياطية محفوظة حالياً', 'info');
    return;
  }
  try {
    const snap = JSON.parse(raw);
    const dateFormatted = new Date(snap.timestamp).toLocaleString('ar-SA');
    const salesCount = snap.sales ? snap.sales.length : 0;
    const expCount = snap.expenses ? snap.expenses.length : 0;

    if (confirm('هل ترغب في استعادة نسخة الطوارئ المحفوظة تلقائياً بتاريخ (' + dateFormatted + ')؟\nتحتوي على: ' + salesCount + ' مبيعات و ' + expCount + ' مصاريف.')) {
      if (Array.isArray(snap.sales)) salesData = snap.sales;
      if (Array.isArray(snap.expenses)) expensesData = snap.expenses;
      saveDataToStorage(true);
      showToast('تمت استعادة نسخة الطوارئ بنجاح!', 'success');
    }
  } catch (err) {
    showToast('حدث خطأ في قراءة نسخة الطوارئ', 'error');
  }
}

function promptChangeCloudBin() {
  const current = activeCloudBinId;
  const newId = prompt('أدخل كود المزامنة السحابية المشترك بين أجهزتك:\n(أو اتركه فارغاً لتوليد كود خاص جديد ومستقل لجهازك فقط)', current);
  if (newId === null) return;

  let finalId = newId.trim();
  if (!finalId) {
    finalId = 'matar_' + Math.random().toString(36).substring(2, 9);
  }

  activeCloudBinId = finalId;
  localStorage.setItem(CLOUD_BIN_STORAGE_KEY, activeCloudBinId);
  const displayCode = document.getElementById('displaySyncBinId');
  if (displayCode) displayCode.textContent = activeCloudBinId;

  pushDataToCloud(true);
  showToast('تم ضبط كود المزامنة الجديد: ' + activeCloudBinId, 'success');
}

// =========================================================
// 12. محرك المزامنة السحابية الفورية (Real-Time Cloud Sync)
// =========================================================
const DEFAULT_CLOUD_BIN_ID = 'ffbfffd';
const CLOUD_BIN_STORAGE_KEY = 'matar_app_cloud_bin_id';
const CLOUD_API_BASE = 'https://extendsclass.com/api/json-storage/bin/';

let activeCloudBinId = DEFAULT_CLOUD_BIN_ID;
let isSyncing = false;
let syncDebounceTimer = null;
let lastCloudSyncTimestamp = 0;

function initCloudSyncConfig() {
  const urlParams = new URLSearchParams(window.location.search);
  const syncParam = urlParams.get('sync');
  
  if (syncParam && syncParam.trim()) {
    activeCloudBinId = syncParam.trim();
    localStorage.setItem(CLOUD_BIN_STORAGE_KEY, activeCloudBinId);
  } else {
    activeCloudBinId = localStorage.getItem(CLOUD_BIN_STORAGE_KEY) || DEFAULT_CLOUD_BIN_ID;
  }

  const displayCode = document.getElementById('displaySyncBinId');
  if (displayCode) displayCode.textContent = activeCloudBinId;
}

function updateCloudBadgeStatus(status, text) {
  const badge = document.getElementById('cloudSyncBadge');
  const settingBadge = document.getElementById('cloudSettingBadge');
  if (!badge) return;

  badge.className = 'cloud-sync-status ' + status;

  if (status === 'syncing') {
    badge.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin cloud-icon"></i><span id="cloudSyncText">' + text + '</span>';
  } else if (status === 'synced') {
    badge.innerHTML = '<i class="fa-solid fa-cloud-check cloud-icon"></i><span id="cloudSyncText">' + text + '</span>';
    if (settingBadge) settingBadge.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> متزامن';
  } else if (status === 'offline') {
    badge.innerHTML = '<i class="fa-solid fa-cloud-slash cloud-icon"></i><span id="cloudSyncText">' + text + '</span>';
    if (settingBadge) settingBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-warning"></i> أوفلاين';
  }
}

async function pushDataToCloud(notify = false) {
  if (!isCloudSyncEnabled()) {
    if (notify) showToast('المزامنة السحابية متوقفة حالياً من الإعدادات', 'info');
    return;
  }
  if (isSyncing) return;
  isSyncing = true;
  updateCloudBadgeStatus('syncing', 'جاري الحفظ بالسحابة...');

  try {
    const timestamp = Date.now();
    const payload = {
      sales: salesData,
      expenses: expensesData,
      securityPin: getSecurityPin(),
      lastUpdated: timestamp
    };

    const res = await fetch(CLOUD_API_BASE + activeCloudBinId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      lastCloudSyncTimestamp = timestamp;
      lastLocalUpdateTimestamp = timestamp;
      localStorage.setItem(STORAGE_LAST_UPDATED_KEY, String(timestamp));
      updateCloudBadgeStatus('synced', 'متزامن ومحفوظ بالسحابة');
      if (notify) showToast('تم حفظ ورفع كافة البيانات إلى السحابة بنجاح!', 'success');
    } else {
      updateCloudBadgeStatus('offline', 'تعذر الحفظ بالسحابة');
      if (notify) showToast('تعذر الحفظ بالسحابة، بياناتك محفوظة محلياً بأمان تام', 'warning');
    }
  } catch (err) {
    console.warn('Cloud sync push error:', err);
    updateCloudBadgeStatus('offline', 'غير متصل بالسحابة');
    if (notify) showToast('تم حفظ البيانات محلياً على جهازك بأمان', 'info');
  } finally {
    isSyncing = false;
  }
}

async function pullDataFromCloud(isManual = false) {
  if (!isCloudSyncEnabled()) {
    updateCloudBadgeStatus('offline', 'المزامنة معطلة');
    return;
  }
  if (isSyncing) return;
  isSyncing = true;
  updateCloudBadgeStatus('syncing', 'جاري الفحص...');

  try {
    const res = await fetch(CLOUD_API_BASE + activeCloudBinId + '?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        const cloudTimestamp = Number(data.lastUpdated) || 0;
        const localTimestamp = Number(localStorage.getItem(STORAGE_LAST_UPDATED_KEY)) || 0;
        const cloudSales = Array.isArray(data.sales) ? data.sales : [];
        const cloudExpenses = Array.isArray(data.expenses) ? data.expenses : [];

        // 1. حماية حاسمة: إذا كانت السحابة فارغة بينما يوجد لدى المستخدم مبيعات أو مصاريف محلية،
        // لا نحذف بيانات المستخدم المحلية أبداً، بل نرفع البيانات المحلية للسحابة فوراً لحفظها!
        if (cloudSales.length === 0 && salesData.length > 0) {
          console.log('السحابة فارغة بينما يوجد مبيعات محلية: رفع البيانات المحلية لحمايتها وتحديث السحابة');
          isSyncing = false;
          await pushDataToCloud(false);
          return;
        }

        // 2. إذا كانت البيانات المحلية أحدث من السحابة ولم يكن الطلب استعادة يدوية،
        // نقوم برفع التعديلات المحلية للسحابة لتحديثها بدلاً من مسحها
        if (localTimestamp > cloudTimestamp && !isManual) {
          console.log('البيانات المحلية أحدث من السحابة: مزامنة بالرفع');
          isSyncing = false;
          await pushDataToCloud(false);
          return;
        }

        // 3. تحديث البيانات المحلية من السحابة إذا كانت أحدث أو إذا كان طلباً يدوياً
        if (isManual || cloudTimestamp > localTimestamp || (salesData.length === 0 && cloudSales.length > 0)) {
          if (Array.isArray(data.sales)) salesData = data.sales;
          if (Array.isArray(data.expenses)) expensesData = data.expenses;
          if (data.securityPin) setSecurityPin(data.securityPin);

          lastCloudSyncTimestamp = cloudTimestamp || Date.now();
          localStorage.setItem(STORAGE_SALES_KEY, JSON.stringify(salesData));
          localStorage.setItem(STORAGE_EXPENSES_KEY, JSON.stringify(expensesData));
          localStorage.setItem(STORAGE_LAST_UPDATED_KEY, String(lastCloudSyncTimestamp));

          updateAllViews();
          if (isManual) showToast('تمت المزامنة وجلب أحدث البيانات من السحابة بنجاح!', 'success');
        }
        updateCloudBadgeStatus('synced', 'متزامن سحابياً');
      }
    } else {
      updateCloudBadgeStatus('offline', 'غير متصل بالسحابة');
    }
  } catch (err) {
    console.warn('Cloud sync pull error:', err);
    updateCloudBadgeStatus('offline', 'غير متصل بالسحابة');
  } finally {
    isSyncing = false;
  }
}

function scheduleCloudPush() {
  if (!isCloudSyncEnabled()) return;
  updateCloudBadgeStatus('syncing', 'جاري الحفظ بالسحابة...');
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    pushDataToCloud(false);
  }, 450);
}

function triggerManualSync(notify = true) {
  if (notify) showToast('جاري الاتصال بالسحابة وجلب أحدث البيانات...', 'info');
  pullDataFromCloud(true);
}

function copyCloudSyncLink() {
  const currentUrl = window.location.origin + window.location.pathname;
  const syncUrl = currentUrl + (currentUrl.includes('?') ? '&' : '?') + 'sync=' + activeCloudBinId;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(syncUrl).then(() => {
      showToast('تم نسخ رابط المزامنة للجوال بنجاح! أرسله لواتساب جوالك', 'success');
    }).catch(() => {
      prompt('انسخ هذا الرابط وافتحه على جوالك:', syncUrl);
    });
  } else {
    prompt('انسخ هذا الرابط وافتحه على جوالك:', syncUrl);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initLiveClockAndDate();
  initCloudSyncConfig();
  updateCloudSyncToggleUI();
  loadDataFromStorage();
  updateAllViews();

  if (isCloudSyncEnabled()) {
    pullDataFromCloud(false);
  }

  // تحديث تلقائي فوري عند فتح الجوال أو الرجوع لصفحة التطبيق
  window.addEventListener('focus', () => {
    if (isCloudSyncEnabled()) pullDataFromCloud(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isCloudSyncEnabled()) pullDataFromCloud(false);
  });
  // مزامنة دورية كل 20 ثانية في الخلفية
  setInterval(() => {
    if (!document.hidden && isCloudSyncEnabled()) pullDataFromCloud(false);
  }, 20000);

  initNavigation();
  initPWAAndInstall();
});