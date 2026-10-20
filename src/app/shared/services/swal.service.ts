import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class SwalService {

  exito(texto: string, timer = 1500): Promise<unknown> {
    return Swal.fire({ icon: 'success', text: texto, timer, showConfirmButton: false });
  }

  error(texto: string): Promise<unknown> {
    return Swal.fire({ icon: 'error', text: texto });
  }

  aviso(texto: string, icon: 'warning' | 'info' | 'question' = 'warning'): Promise<unknown> {
    return Swal.fire({ icon, text: texto });
  }

  confirmar(titulo: string, texto: string, icon: 'warning' | 'info' = 'warning', confirmarTexto = 'Sí'): Promise<boolean> {
    return Swal.fire({
      title: titulo,
      text: texto,
      icon,
      showCancelButton: true,
      confirmButtonText: confirmarTexto,
      cancelButtonText: 'Revisar'
    }).then(r => !!r.isConfirmed);
  }
}
