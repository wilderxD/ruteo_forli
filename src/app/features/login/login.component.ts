import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SesionService } from '../../core/services/sesion.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  usuario = '';
  password = '';
  error = '';
  cargando = false;

  constructor(
    private auth: AuthService,
    private sesion: SesionService,
    private router: Router
  ) {}

  async ingresar(): Promise<void> {
    this.error = '';
    const user = String(this.usuario ?? '').trim();
    const pass = String(this.password ?? '').trim();
    if (!user || !pass) {
      this.error = 'Ingrese sus credenciales.';
      return;
    }
    this.cargando = true;
    try {
      const r = await this.auth.login(user, pass);
      if (r.ok) {
        const rol = this.sesion.rol;
        const destino = rol === 'admin' ? '/admin' : rol === 'soporte' ? '/soporte' : '/chofer';
        this.router.navigate([destino]);
      } else {
        this.error = r.error ?? 'Credenciales inválidas.';
      }
    } catch {
      this.error = 'Sin conexión. Verifique su señal e intente de nuevo.';
    } finally {
      this.cargando = false;
    }
  }
}
