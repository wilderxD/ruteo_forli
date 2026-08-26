import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SesionService } from '../services/sesion.service';

export const authGuard: CanActivateFn = () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  if (!sesion.estaLogueado()) {
    router.navigate(['/login']);
    return false;
  }
  return true;
};

export function rolGuard(rolesPermitidos: string[]): CanActivateFn {
  return () => {
    const sesion = inject(SesionService);
    const router = inject(Router);
    if (!sesion.estaLogueado()) {
      router.navigate(['/login']);
      return false;
    }
    if (!sesion.esRol(rolesPermitidos)) {
      router.navigate(['/']);
      return false;
    }
    return true;
  };
}
