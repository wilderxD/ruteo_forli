import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class ExcelService {

  generarExcelExplosion(rutas: unknown[][]): void {
    const dataExport: Record<string, string>[] = [];
    for (let i = 1; i < rutas.length; i++) {
      const r = rutas[i];
      if (r[12]) {
        dataExport.push({
          'CODIGO': String(r[7] || ''),
          'MODELOL': String(r[8] || ''),
          'CANTIDAD': String(r[9] || ''),
          ' ': '',
          'PEDIDO': String(r[10] || ''),
          'PLACAS': String(r[12] || ''),
          'DISTRITO': String(r[5] || ''),
          'CLIENTE': String(r[2] || ''),
          'ORDEN': String(r[13] || ''),
          'OBSERVACIONES': String(r[11] || '')
        });
      }
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataExport);
    XLSX.utils.book_append_sheet(wb, ws, 'Explosion');
    XLSX.writeFile(wb, 'ruta para la explosion.xlsx');
  }

  generarExcelRutaDelDia(rutas: unknown[][], asignacion: unknown[][]): void {
    const choferApellido: Record<string, string> = {};
    for (let i = 1; i < asignacion.length; i++) {
      const p = String(asignacion[i][0] || '');
      const n = String(asignacion[i][1] || 'Chofer');
      choferApellido[p] = n.trim().split(' ')[0].toUpperCase();
    }

    const datosPorPlaca: Record<string, unknown[][]> = {};
    for (let i = 1; i < rutas.length; i++) {
      const r = rutas[i];
      const placa = String(r[12] || '');
      if (placa) {
        if (!datosPorPlaca[placa]) datosPorPlaca[placa] = [];
        datosPorPlaca[placa].push(r);
      }
    }

    const aoa: unknown[] = [];
    const merges: XLSX.Range[] = [];
    let rowIndex = 0;
    const estiloTitulo = { font: { bold: true, sz: 22 }, alignment: { horizontal: 'center', vertical: 'center' } };
    const estiloCabecera = { font: { bold: true }, fill: { fgColor: { rgb: 'B4C6E7' } }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };
    const estiloCelda = { border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };

    for (const placa in datosPorPlaca) {
      const items = datosPorPlaca[placa];
      items.sort((a, b) => (parseInt(a[13] as string) || 9999) - (parseInt(b[13] as string) || 9999));
      const ePlaca = (choferApellido[placa] || 'CHOFER') + ' ' + placa;
      const fTit = Array(13).fill({ v: '', t: 's', s: estiloTitulo });
      fTit[0] = { v: ePlaca, t: 's', s: estiloTitulo };
      aoa.push(fTit);
      merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 12 } });
      rowIndex++;

      const cab = ['TIENDA', 'TIPO', 'CLIENTE', 'DIRECCION', 'REFERENCIA', 'DISTRITO', 'TELEFONO', 'CODIGO', 'MODELOL', 'CANTIDAD', 'PEDIDO', 'ORDEN_ENTREGA.', 'OBSERVACIONES'];
      aoa.push(cab.map(t => ({ v: t, t: 's', s: estiloCabecera })));
      rowIndex++;

      items.forEach(r => {
        const val = [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[13], r[11]];
        aoa.push(val.map(v => ({ v: v !== undefined && v !== null ? String(v) : '', t: (typeof v === 'number') ? 'n' : 's', s: estiloCelda })));
        rowIndex++;
      });
      aoa.push([]); rowIndex++;
      aoa.push([]); rowIndex++;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 25 }, { wch: 35 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 35 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ruta del Dia');
    XLSX.writeFile(wb, 'ruta del dia.xlsx');
  }

  reporteSoporte(registros: {
    cliente: string; pedido: string; seriePedido: string; distrito: string;
    situacion: string; respuesta: string; placa: string; chofer: string;
    codigoAtc: string; motivo: string; observacionesSoporte: string;
  }[]): void {
    const dataExport = registros.map(r => ({
      'CLIENTE': r.cliente,
      'N° PEDIDO': r.pedido,
      'SERIE-PEDIDO': r.seriePedido,
      'DISTRITO': r.distrito,
      'SITUACIÓN': r.situacion,
      'RESPUESTA': r.respuesta,
      'PLACA': r.placa,
      'CHOFER': r.chofer,
      'CÓDIGO ATC': r.codigoAtc,
      'MOTIVO': r.motivo,
      'OBSERVACIONES SOPORTE': r.observacionesSoporte
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataExport);
    const estiloCab = { font: { bold: true }, fill: { fgColor: { rgb: 'C2E7D9' } } };
    for (const key in ws) {
      if (key[1] === '1') (ws as unknown as Record<string, { s?: unknown }>)[key].s = estiloCab;
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Soporte_Obs');
    XLSX.writeFile(wb, 'Reporte_Soporte_Observaciones.xlsx');
  }
}
