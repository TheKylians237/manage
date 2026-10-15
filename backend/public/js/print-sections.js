'use strict';

(() => {
  const printButton = (label, target) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn print-section-button';
    button.textContent = `⎙ ${label}`;
    button.addEventListener('click', () => printSection(target));
    return button;
  };

  function printSection({ title, content }) {
    document.querySelector('#print-root')?.remove();
    const root = document.createElement('section');
    root.id = 'print-root';
    const heading = document.createElement('h1');
    heading.textContent = title;
    const context = document.createElement('p');
    context.className = 'print-context';
    const period = document.querySelector('#footer-period, #row-count');
    context.textContent = [document.title, period?.textContent].filter(Boolean).join(' · ');
    const clone = content.cloneNode(true);

    clone.querySelectorAll('select').forEach(select => {
      const value = document.createElement('span');
      value.textContent = select.selectedOptions[0]?.textContent || '';
      select.replaceWith(value);
    });
    clone.querySelectorAll('input, button, a, .table-tools, .print-section-button, .pagination').forEach(node => node.remove());
    clone.querySelectorAll('[hidden]').forEach(node => node.remove());

    root.append(heading, context, clone);
    document.body.append(root);
    const cleanUp = () => {
      document.body.classList.remove('printing-section');
      root.remove();
      window.removeEventListener('afterprint', cleanUp);
    };
    window.addEventListener('afterprint', cleanUp, { once: true });
    document.body.classList.add('printing-section');
    window.print();
    setTimeout(cleanUp, 1500);
  }

  function addButton(host, label, target) {
    if (!host) return;
    host.append(printButton(label, target));
  }

  function mount() {
    document.querySelectorAll('.card').forEach((card, index) => {
      const tableHosts = [...card.querySelectorAll('table.data-table')];
      tableHosts.forEach((table, tableIndex) => {
        const content = table.closest('.table-scroll') || table;
        const heading = card.querySelector('.card-head h2, .card-head h3')?.textContent.trim()
          || document.querySelector('.page-title')?.textContent.trim()
          || 'Tableau';
        const target = { title: heading, content };
        let host = card.querySelector('.card-head');
        if (!host) host = card.querySelector('.table-tools') || card;
        addButton(host, 'Imprimer le tableau', target);
      });

      card.querySelectorAll('.summary-text').forEach(summary => {
        const heading = card.querySelector('.card-head h2, .card-head h3')?.textContent.trim()
          || 'Synthèse';
        addButton(card.querySelector('.card-head') || summary.parentElement, 'Imprimer la synthèse', {
          title: heading,
          content: summary.parentElement
        });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
