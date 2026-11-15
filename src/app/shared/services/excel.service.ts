import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx-js-style';

const COLOR = {
  oscuro: '121212',
  rojo: 'D32F2F',
  rojoOscuro: 'B71C1C',
  blanco: 'FFFFFF',
  borde: 'D9D9D9',
  filaAlterna: 'FFF8F7',
  texto: '1F2937',
  soporteFondo: 'C2E7D9',
  soporteBorde: 'A5D6A7',
  soporteTexto: '1B5E20'
};

const BORDE_FINO = {
  top: { style: 'thin', color: { rgb: COLOR.borde } },
  bottom: { style: 'thin', color: { rgb: COLOR.borde } },
  left: { style: 'thin', color: { rgb: COLOR.borde } },
  right: { style: 'thin', color: { rgb: COLOR.borde } }
};

const BORDE_CABECERA = {
  top: { style: 'thin', color: { rgb: COLOR.rojoOscuro } },
  bottom: { style: 'thin', color: { rgb: COLOR.rojoOscuro } },
  left: { style: 'thin', color: { rgb: COLOR.rojoOscuro } },
  right: { style: 'thin', color: { rgb: COLOR.rojoOscuro } }
};

const BORDE_TITULO = {
  top: { style: 'thin', color: { rgb: COLOR.oscuro } },
  bottom: { style: 'thin', color: { rgb: COLOR.oscuro } },
  left: { style: 'thin', color: { rgb: COLOR.oscuro } },
  right: { style: 'thin', color: { rgb: COLOR.oscuro } }
};

const BORDE_SOPORTE = {
  top: { style: 'thin', color: { rgb: COLOR.soporteBorde } },
  bottom: { style: 'thin', color: { rgb: COLOR.soporteBorde } },
  left: { style: 'thin', color: { rgb: COLOR.soporteBorde } },
  right: { style: 'thin', color: { rgb: COLOR.soporteBorde } }
};

const ESTILO_TITULO = {
  font: { bold: true, sz: 18, color: { rgb: COLOR.blanco }, name: 'Calibri' },
  fill: { fgColor: { rgb: COLOR.oscuro }, patternType: 'solid' },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDE_TITULO
};

const ESTILO_CABECERA = {
  font: { bold: true, sz: 11, color: { rgb: COLOR.blanco }, name: 'Calibri' },
  fill: { fgColor: { rgb: COLOR.rojo }, patternType: 'solid' },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: BORDE_CABECERA
};

const ESTILO_CABECERA_SOPORTE = {
  font: { bold: true, sz: 11, color: { rgb: COLOR.soporteTexto }, name: 'Calibri' },
  fill: { fgColor: { rgb: COLOR.soporteFondo }, patternType: 'solid' },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: BORDE_SOPORTE
};

const ESTILO_CELDA = {
  font: { sz: 10, color: { rgb: COLOR.texto }, name: 'Calibri' },
  alignment: { vertical: 'center', wrapText: true },
  border: BORDE_FINO
};

const ESTILO_CELDA_ALT = {
  ...ESTILO_CELDA,
  fill: { fgColor: { rgb: COLOR.filaAlterna }, patternType: 'solid' }
};

const ESTILO_CELDA_CENTRO = {
  ...ESTILO_CELDA,
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
};

const ESTILO_CELDA_CENTRO_ALT = {
  ...ESTILO_CELDA_CENTRO,
  fill: { fgColor: { rgb: COLOR.filaAlterna }, patternType: 'solid' }
};

const ESTILO_CELDA_DESTACADA = {
  ...ESTILO_CELDA,
  font: { bold: true, sz: 10, color: { rgb: COLOR.rojo }, name: 'Calibri' },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
};

const ESTILO_CELDA_DESTACADA_ALT = {
  ...ESTILO_CELDA_DESTACADA,
  fill: { fgColor: { rgb: COLOR.filaAlterna }, patternType: 'solid' }
};

@Injectable({ providedIn: 'root' })
export class ExcelService {

  generarExcelExplosion(rutas: unknown[][]): void {
    const filas = rutas.slice(1).filter(fila => fila && fila[12]);
    const aoa: XLSX.CellObject[][] = [];
    const altoFilas: XLSX.RowInfo[] = [];

    const cabecera = ['CODIGO', 'MODELOL', 'CANTIDAD', ' ', 'PEDIDO', 'PLACAS', 'DISTRITO', 'CLIENTE', 'ORDEN', 'OBSERVACIONES'];
    aoa.push(cabecera.map(titulo => this.celda(titulo, ESTILO_CABECERA)));
    altoFilas.push({ hpt: 30 });

    filas.forEach((r, indice) => {
      const alterna = indice % 2 === 1;
      const valores = [r[7], r[8], r[9], ' ', r[10], r[12], r[5], r[2], r[13], r[11]];
      aoa.push(valores.map((valor, columna) => this.celda(valor, this.estiloExplosion(columna, alterna))));
      altoFilas.push({ hpt: 28 });
    });

    const ws = this.crearHoja(aoa, altoFilas);
    ws['!cols'] = [
      { wch: 12 }, { wch: 34 }, { wch: 10 }, { wch: 3 }, { wch: 14 },
      { wch: 14 }, { wch: 18 }, { wch: 40 }, { wch: 10 }, { wch: 45 }
    ];
    if (filas.length > 0) {
      ws['!autofilter'] = { ref: 'A1:J' + aoa.length };
    }

    const wb = XLSX.utils.book_new();
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

    const aoa: XLSX.CellObject[][] = [];
    const merges: XLSX.Range[] = [];
    const altoFilas: XLSX.RowInfo[] = [];
    let rowIndex = 0;

    for (const placa in datosPorPlaca) {
      const items = datosPorPlaca[placa];
      items.sort((a, b) => (parseInt(a[13] as string) || 9999) - (parseInt(b[13] as string) || 9999));
      const ePlaca = (choferApellido[placa] || 'CHOFER') + ' ' + placa;

      const filaTitulo = Array.from({ length: 13 }, (_, columna) =>
        this.celda(columna === 0 ? ePlaca : '', ESTILO_TITULO)
      );
      aoa.push(filaTitulo);
      altoFilas.push({ hpt: 32 });
      merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 12 } });
      rowIndex++;

      const cabecera = ['TIENDA', 'TIPO', 'CLIENTE', 'DIRECCION', 'REFERENCIA', 'DISTRITO', 'TELEFONO', 'CODIGO', 'MODELOL', 'CANTIDAD', 'PEDIDO', 'ORDEN_ENTREGA.', 'OBSERVACIONES'];
      aoa.push(cabecera.map(titulo => this.celda(titulo, ESTILO_CABECERA)));
      altoFilas.push({ hpt: 30 });
      rowIndex++;

      items.forEach((r, indice) => {
        const alterna = indice % 2 === 1;
        const valores = [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[13], r[11]];
        aoa.push(valores.map((valor, columna) => this.celda(valor, this.estiloRuta(columna, alterna))));
        altoFilas.push({ hpt: 30 });
        rowIndex++;
      });

      aoa.push([]);
      altoFilas.push({ hpt: 8 });
      rowIndex++;
      aoa.push([]);
      altoFilas.push({ hpt: 8 });
      rowIndex++;
    }

    const ws = this.crearHoja(aoa, altoFilas);
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 14 }, { wch: 10 }, { wch: 30 }, { wch: 42 }, { wch: 28 },
      { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 32 }, { wch: 10 },
      { wch: 14 }, { wch: 16 }, { wch: 42 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ruta del Dia');
    XLSX.writeFile(wb, 'ruta del dia.xlsx');
  }

  reporteSoporte(registros: {
    cliente: string; pedido: string; seriePedido: string; distrito: string;
    situacion: string; respuesta: string; placa: string; chofer: string;
    codigoAtc: string; motivo: string; observacionesSoporte: string;
  }[]): void {
    const aoa: XLSX.CellObject[][] = [];
    const altoFilas: XLSX.RowInfo[] = [];

    const cabecera = ['CLIENTE', 'N° PEDIDO', 'SERIE-PEDIDO', 'DISTRITO', 'SITUACIÓN', 'RESPUESTA', 'PLACA', 'CHOFER', 'CÓDIGO ATC', 'MOTIVO', 'OBSERVACIONES SOPORTE'];
    aoa.push(cabecera.map(titulo => this.celda(titulo, ESTILO_CABECERA_SOPORTE)));
    altoFilas.push({ hpt: 30 });

    registros.forEach((r, indice) => {
      const alterna = indice % 2 === 1;
      const valores = [
        r.cliente, r.pedido, r.seriePedido, r.distrito, r.situacion,
        r.respuesta, r.placa, r.chofer, r.codigoAtc, r.motivo,
        r.observacionesSoporte
      ];
      aoa.push(valores.map((valor, columna) => this.celda(valor, this.estiloSoporte(columna, alterna))));
      altoFilas.push({ hpt: 28 });
    });

    const ws = this.crearHoja(aoa, altoFilas);
    ws['!cols'] = [
      { wch: 34 }, { wch: 13 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 32 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 34 },
      { wch: 45 }
    ];
    if (registros.length > 0) {
      ws['!autofilter'] = { ref: 'A1:K' + aoa.length };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Soporte_Obs');
    XLSX.writeFile(wb, 'Reporte_Soporte_Observaciones.xlsx');
  }

  private crearHoja(aoa: XLSX.CellObject[][], altoFilas: XLSX.RowInfo[]): XLSX.WorkSheet {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!rows'] = altoFilas;
    return ws;
  }

  private celda(valor: unknown, estilo: object): XLSX.CellObject {
    return {
      v: valor === undefined || valor === null ? '' : String(valor),
      t: 's',
      s: estilo
    };
  }

  private estiloExplosion(columna: number, alterna: boolean): object {
    if (columna === 5) {
      return alterna ? ESTILO_CELDA_DESTACADA_ALT : ESTILO_CELDA_DESTACADA;
    }
    const centrada = [0, 2, 3, 4, 8].includes(columna);
    if (centrada) {
      return alterna ? ESTILO_CELDA_CENTRO_ALT : ESTILO_CELDA_CENTRO;
    }
    return alterna ? ESTILO_CELDA_ALT : ESTILO_CELDA;
  }

  private estiloRuta(columna: number, alterna: boolean): object {
    const centrada = [1, 6, 7, 9, 10, 11].includes(columna);
    if (centrada) {
      return alterna ? ESTILO_CELDA_CENTRO_ALT : ESTILO_CELDA_CENTRO;
    }
    return alterna ? ESTILO_CELDA_ALT : ESTILO_CELDA;
  }

  private estiloSoporte(columna: number, alterna: boolean): object {
    const centrada = [1, 2, 6, 8].includes(columna);
    if (centrada) {
      return alterna ? ESTILO_CELDA_CENTRO_ALT : ESTILO_CELDA_CENTRO;
    }
    return alterna ? ESTILO_CELDA_ALT : ESTILO_CELDA;
  }
}
